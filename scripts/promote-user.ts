import { PrismaClient, UserRole } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import dotenv from "dotenv";

// Forçar carregamento das variáveis de ambiente antes de qualquer coisa
dotenv.config();

// Instanciar o PrismaClient usando o Adapter PG como no projeto principal
// O erro anterior indicou que o Prisma Client foi gerado para usar Driver Adapter, então é obrigatório usá-lo
const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const email = "jonadab.leite@gmail.com";

  console.log(`🔍 Buscando usuário: ${email}...`);

  try {
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      console.error(
        `❌ Usuário não encontrado! Verifique se o email está correto: ${email}`
      );
      process.exit(1);
    }

    console.log(`👤 Usuário encontrado: ${user.id}`);
    console.log(`🔰 Roles atuais: ${user.roles.join(", ")}`);

    console.log("🔄 Atualizando permissões para ADMIN e OWNER...");

    const updatedUser = await prisma.user.update({
      where: { email },
      data: {
        roles: {
          set: [UserRole.ADMIN, UserRole.OWNER, UserRole.BUYER],
        },
      },
    });

    console.log(`✅ Sucesso! Novas roles: ${updatedUser.roles.join(", ")}`);
  } catch (error) {
    throw error;
  }
}

main()
  .catch((e) => {
    console.error("❌ Erro ao atualizar usuário:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
