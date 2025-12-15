#!/usr/bin/env node
/**
 * Script simples para compilar TypeScript no contexto do Docker
 * Usando npm + tsconfig.build.json (sem workspace)
 */
const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const apiDir = path.resolve(__dirname, "..");
const tsconfigPath = path.join(apiDir, "tsconfig.build.json");
const srcPath = path.join(apiDir, "src");

if (!fs.existsSync(tsconfigPath)) {
  console.error("❌ Error: tsconfig.build.json not found");
  process.exit(1);
}

if (!fs.existsSync(srcPath)) {
  console.error(`❌ Error: Source directory not found: ${srcPath}`);
  process.exit(1);
}

const countTsFiles = (dir) => {
  let count = 0;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!["node_modules", "dist"].includes(entry.name)) {
          count += countTsFiles(fullPath);
        }
      } else if (
        entry.isFile() &&
        entry.name.endsWith(".ts") &&
        !entry.name.includes(".test.") &&
        !entry.name.includes(".spec.")
      ) {
        count++;
      }
    }
  } catch {
    /* noop */
  }
  return count;
};

const tsFileCount = countTsFiles(srcPath);
if (tsFileCount === 0) {
  console.error("❌ Error: No TypeScript files found to compile");
  console.error(`   Searched in: ${srcPath}`);
  process.exit(1);
}
console.log(`📝 Found ${tsFileCount} TypeScript files to compile`);
console.log("🔨 Compiling TypeScript...");
console.log(`📁 Working directory: ${apiDir}`);
console.log(`📄 Using tsconfig: ${tsconfigPath}`);

try {
  execSync(`npx tsc -p tsconfig.build.json`, {
    cwd: apiDir,
    stdio: "inherit",
    env: { ...process.env },
  });
  console.log("✅ TypeScript compilation completed");
} catch (error) {
  console.error("❌ TypeScript compilation failed");
  process.exit(1);
}
