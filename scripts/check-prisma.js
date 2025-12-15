#!/usr/bin/env node

/**
 * Script rápido para verificar se o Prisma Client existe
 * Se não existir, tenta gerar (mas não bloqueia se falhar)
 */

const fs = require("fs");
const path = require("path");

const findPrismaClientPath = () => {
  const nodeModulesPath = path.join(__dirname, "../../node_modules");

  try {
    if (fs.existsSync(nodeModulesPath)) {
      // Procurar em .pnpm
      const pnpmPath = path.join(nodeModulesPath, ".pnpm");
      if (fs.existsSync(pnpmPath)) {
        const entries = fs.readdirSync(pnpmPath);
        const prismaEntry = entries.find((e) => e.startsWith("@prisma+client@"));
        if (prismaEntry) {
          const clientPath = path.join(
            pnpmPath,
            prismaEntry,
            "node_modules",
            ".prisma",
            "client",
          );
          if (fs.existsSync(clientPath)) {
            const files = fs.readdirSync(clientPath);
            if (files.some((f) => f.includes("index.js"))) {
              return true;
            }
          }
        }
      }

      // Procurar diretamente
      const directPath = path.join(
        nodeModulesPath,
        "@prisma",
        "client",
        ".prisma",
        "client",
      );
      if (fs.existsSync(directPath)) {
        const files = fs.readdirSync(directPath);
        if (files.some((f) => f.includes("index.js"))) {
          return true;
        }
      }
    }
  } catch (err) {
    // Ignorar erros
  }

  return false;
};

if (!findPrismaClientPath()) {
  console.log(
    "⚠️  Prisma Client não encontrado. Execute: npm run prisma:generate",
  );
  console.log("   Continuando mesmo assim...");
}

process.exit(0);
