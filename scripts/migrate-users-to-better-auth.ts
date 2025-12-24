/**
 * Script de Migração de Usuários para Better Auth
 * 
 * Este script migra usuários existentes do sistema legado para o formato
 * do Better Auth, criando registros na tabela Account com as senhas
 * já existentes (em formato bcrypt).
 * 
 * @usage
 * npx ts-node scripts/migrate-users-to-better-auth.ts
 * 
 * @safety
 * - O script é idempotente: pode ser executado múltiplas vezes sem duplicar dados
 * - Usuários que já possuem Account não serão afetados
 * - Senhas bcrypt existentes são preservadas
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

// Configurar o Pool e Adapter igual ao prismaClient.ts do projeto
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const adapter = new PrismaPg(pool);

const prisma = new PrismaClient({
  adapter,
  log: ["error", "warn"],
});

interface MigrationStats {
  totalUsers: number;
  migratedUsers: number;
  skippedUsers: number;
  errors: number;
}

const logProgress = (message: string): void => {
  console.log(`[${new Date().toISOString()}] ${message}`);
};

const logError = (message: string, error?: unknown): void => {
  console.error(`[${new Date().toISOString()}] ❌ ${message}`, error);
};

const logSuccess = (message: string): void => {
  console.log(`[${new Date().toISOString()}] ✅ ${message}`);
};

/**
 * Migra um único usuário para o Better Auth
 */
const migrateUser = async (
  user: {
    id: string;
    email: string;
    passwordHash: string;
    name: string | null;
    createdAt: Date;
    updatedAt: Date;
  }
): Promise<boolean> => {
  try {
    // Verificar se já existe uma Account para este usuário
    const existingAccount = await prisma.account.findFirst({
      where: {
        userId: user.id,
        providerId: "credential",
      },
    });

    if (existingAccount) {
      logProgress(`Usuário ${user.email} já possui Account - pulando`);
      return false;
    }

    // Criar Account com a senha existente
    await prisma.account.create({
      data: {
        userId: user.id,
        accountId: user.id, // Para credential provider, accountId = userId
        providerId: "credential",
        password: user.passwordHash, // Senha já em bcrypt
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
    });

    // Atualizar campos do usuário para compatibilidade com Better Auth
    // (name e emailVerified se não existirem)
    await prisma.user.update({
      where: { id: user.id },
      data: {
        name: user.name || user.email.split("@")[0],
        emailVerified: true, // Usuários existentes são considerados verificados
      },
    });

    logSuccess(`Usuário ${user.email} migrado com sucesso`);
    return true;
  } catch (error) {
    logError(`Erro ao migrar usuário ${user.email}`, error);
    return false;
  }
};

/**
 * Função principal de migração
 */
const migrateAllUsers = async (): Promise<MigrationStats> => {
  const stats: MigrationStats = {
    totalUsers: 0,
    migratedUsers: 0,
    skippedUsers: 0,
    errors: 0,
  };

  logProgress("Iniciando migração de usuários para Better Auth...");

  try {
    // Buscar todos os usuários
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        passwordHash: true,
        name: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    stats.totalUsers = users.length;
    logProgress(`Encontrados ${stats.totalUsers} usuários para migrar`);

    // Processar usuários em lotes para evitar sobrecarga
    const BATCH_SIZE = 50;
    for (let i = 0; i < users.length; i += BATCH_SIZE) {
      const batch = users.slice(i, i + BATCH_SIZE);
      logProgress(`Processando lote ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(users.length / BATCH_SIZE)}`);

      const results = await Promise.all(batch.map(migrateUser));
      
      results.forEach((migrated) => {
        if (migrated) {
          stats.migratedUsers++;
        } else {
          stats.skippedUsers++;
        }
      });
    }

    logProgress("Migração concluída!");
    return stats;
  } catch (error) {
    logError("Erro durante a migração", error);
    stats.errors++;
    return stats;
  }
};

/**
 * Função para verificar a migração
 */
const verifyMigration = async (): Promise<void> => {
  logProgress("Verificando migração...");

  const totalUsers = await prisma.user.count();
  const usersWithAccount = await prisma.user.count({
    where: {
      accounts: {
        some: {
          providerId: "credential",
        },
      },
    },
  });

  const usersWithoutAccount = totalUsers - usersWithAccount;

  logProgress(`Total de usuários: ${totalUsers}`);
  logProgress(`Usuários com Account (credential): ${usersWithAccount}`);
  logProgress(`Usuários sem Account: ${usersWithoutAccount}`);

  if (usersWithoutAccount === 0) {
    logSuccess("Todos os usuários foram migrados com sucesso!");
  } else {
    logError(`${usersWithoutAccount} usuários ainda precisam ser migrados`);
  }
};

/**
 * Função para rollback da migração (se necessário)
 */
const rollbackMigration = async (): Promise<void> => {
  logProgress("Iniciando rollback da migração...");

  const deleted = await prisma.account.deleteMany({
    where: {
      providerId: "credential",
    },
  });

  logProgress(`${deleted.count} registros de Account removidos`);
  logSuccess("Rollback concluído");
};

// ============================================
// Execução do Script
// ============================================

const main = async (): Promise<void> => {
  const args = process.argv.slice(2);
  const command = args[0] || "migrate";

  try {
    switch (command) {
      case "migrate":
        const stats = await migrateAllUsers();
        console.log("\n📊 Estatísticas da Migração:");
        console.log(`   Total de usuários: ${stats.totalUsers}`);
        console.log(`   Migrados: ${stats.migratedUsers}`);
        console.log(`   Pulados (já migrados): ${stats.skippedUsers}`);
        console.log(`   Erros: ${stats.errors}`);
        break;

      case "verify":
        await verifyMigration();
        break;

      case "rollback":
        const confirm = args[1] === "--confirm";
        if (!confirm) {
          console.log("⚠️  Para executar rollback, use: npx ts-node scripts/migrate-users-to-better-auth.ts rollback --confirm");
          break;
        }
        await rollbackMigration();
        break;

      default:
        console.log("Uso: npx ts-node scripts/migrate-users-to-better-auth.ts [comando]");
        console.log("");
        console.log("Comandos:");
        console.log("  migrate   - Migra usuários existentes para Better Auth (padrão)");
        console.log("  verify    - Verifica o status da migração");
        console.log("  rollback  - Remove registros de Account criados (requer --confirm)");
    }
  } catch (error) {
    logError("Erro fatal", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
};

main();
