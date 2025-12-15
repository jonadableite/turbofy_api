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
    // DATABASE_URL deve estar definida via variável de ambiente
    // O Prisma migrate deploy requer uma conexão válida ao banco
    url: process.env.DATABASE_URL,
  },
});
