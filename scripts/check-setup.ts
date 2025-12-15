#!/usr/bin/env ts-node
/**
 * Script de verificação do ambiente
 * Verifica se todas as dependências e configurações estão corretas
 */

import { existsSync } from 'fs';
import { join } from 'path';
import chalk from 'chalk';

const checks: Array<{ name: string; check: () => boolean; fix?: string }> = [
  {
    name: 'Prisma Client gerado',
    check: () => {
      const prismaPath = join(__dirname, '../node_modules/.prisma/client/index.js');
      return existsSync(prismaPath);
    },
    fix: 'Execute: npm run prisma:generate',
  },
  {
    name: 'Arquivo .env existe',
    check: () => {
      const envPath = join(__dirname, '../.env');
      return existsSync(envPath);
    },
    fix: 'Crie um arquivo .env baseado no .env.example',
  },
  {
    name: 'Chalk instalado',
    check: () => {
      try {
        require.resolve('chalk');
        return true;
      } catch {
        return false;
      }
    },
    fix: 'Execute: npm install',
  },
];

console.log(chalk.cyan('\n🔍 Verificando ambiente do Turbofy Backend...\n'));

let allPassed = true;

for (const { name, check, fix } of checks) {
  const passed = check();
  if (passed) {
    console.log(chalk.green(`  ✅ ${name}`));
  } else {
    console.log(chalk.red(`  ❌ ${name}`));
    if (fix) {
      console.log(chalk.yellow(`     💡 Solução: ${fix}`));
    }
    allPassed = false;
  }
}

console.log('');

if (allPassed) {
  console.log(chalk.green.bold('✨ Todas as verificações passaram! O ambiente está pronto.\n'));
  process.exit(0);
} else {
  console.log(chalk.red.bold('⚠️  Algumas verificações falharam. Corrija os problemas acima.\n'));
  process.exit(1);
}

