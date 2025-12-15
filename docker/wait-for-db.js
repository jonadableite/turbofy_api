#!/usr/bin/env node
/**
 * Script para aguardar o banco de dados estar disponível antes de executar migrations
 */
const { PrismaClient } = require("@prisma/client");

const MAX_RETRIES = 60; // 60 tentativas = 2 minutos (30s entre tentativas)
const RETRY_DELAY = 2000; // 2 segundos

const prisma = new PrismaClient();

const waitForDatabase = async () => {
  console.log("🔄 Aguardando banco de dados ficar disponível...");
  console.log(`📍 DATABASE_URL: ${process.env.DATABASE_URL ? process.env.DATABASE_URL.replace(/:[^:@]+@/, ':****@') : 'não definida'}`);
  
  for (let i = 0; i < MAX_RETRIES; i++) {
    try {
      // Tentar uma query simples para verificar conectividade
      await prisma.$queryRaw`SELECT 1`;
      console.log("✅ Banco de dados está disponível!");
      await prisma.$disconnect();
      return true;
    } catch (error) {
      const attempt = i + 1;
      if (attempt < MAX_RETRIES) {
        const message = error.message || String(error);
        console.log(`⏳ Tentativa ${attempt}/${MAX_RETRIES}: ${message.substring(0, 100)}`);
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
      } else {
        console.error(`❌ Erro após ${MAX_RETRIES} tentativas:`, error.message);
        await prisma.$disconnect();
        return false;
      }
    }
  }
  
  await prisma.$disconnect();
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

