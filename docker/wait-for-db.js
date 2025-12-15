#!/usr/bin/env node
/**
 * Script para aguardar o banco de dados estar disponível antes de executar migrations
 * Usa pg diretamente para evitar problemas com Prisma Client initialization
 */
const { Pool } = require("pg");

const MAX_RETRIES = 60; // 60 tentativas = 2 minutos
const RETRY_DELAY = 2000; // 2 segundos

const waitForDatabase = async () => {
  const databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    console.error("❌ DATABASE_URL não está definida!");
    return false;
  }
  
  // Mascarar senha na URL para logs
  const maskedUrl = databaseUrl.replace(/:([^:@]+)@/, ':****@');
  console.log("🔄 Aguardando banco de dados ficar disponível...");
  console.log(`📍 DATABASE_URL: ${maskedUrl}`);
  
  const pool = new Pool({
    connectionString: databaseUrl,
    // Não fazer connection pooling, apenas testar conectividade
    max: 1,
  });
  
  for (let i = 0; i < MAX_RETRIES; i++) {
    try {
      // Tentar uma query simples para verificar conectividade
      const client = await pool.connect();
      await client.query("SELECT 1");
      client.release();
      console.log("✅ Banco de dados está disponível!");
      await pool.end();
      return true;
    } catch (error) {
      const attempt = i + 1;
      if (attempt < MAX_RETRIES) {
        const message = error.message || String(error);
        // Limitar tamanho da mensagem de erro
        const shortMessage = message.length > 100 ? message.substring(0, 100) + "..." : message;
        console.log(`⏳ Tentativa ${attempt}/${MAX_RETRIES}: ${shortMessage}`);
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
      } else {
        console.error(`❌ Erro após ${MAX_RETRIES} tentativas:`, error.message);
        await pool.end();
        return false;
      }
    }
  }
  
  await pool.end();
  return false;
};

waitForDatabase()
  .then((success) => {
    process.exit(success ? 0 : 1);
  })
  .catch((error) => {
    console.error("❌ Erro inesperado:", error);
    process.exit(1);
  });

