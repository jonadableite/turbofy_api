// Carregar dotenv apenas se disponível (não necessário no Docker onde env vars já estão disponíveis)
try {
  // Tentar carregar dotenv apenas se o módulo existir
  require("dotenv/config");
} catch {
  // dotenv não disponível, usar variáveis de ambiente diretamente
  // Isso é normal no Docker onde as variáveis já estão disponíveis
}

import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // DATABASE_URL pode ser opcional durante o generate (build do Docker)
    // O Prisma generate não precisa de uma conexão real ao banco
    // Usar process.env diretamente com fallback para evitar erro durante build
    url: process.env.DATABASE_URL || "postgres://postgres:c4102143751b6e25d238@painel.whatlead.com.br:5436/turbofy?sslmode=disable",
  },
});
