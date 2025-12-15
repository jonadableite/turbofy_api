#!/bin/sh
# Script para build TypeScript no Docker
# Executa da raiz do workspace para garantir resolução correta de módulos

set -e

# Ir para o diretório da API
cd "$(dirname "$0")/.."

# Verificar se node_modules existe
if [ ! -d "node_modules" ]; then
  echo "❌ Error: node_modules not found"
  exit 1
fi

# Executar TypeScript compiler
echo "🔨 Compiling TypeScript..."
node_modules/.bin/tsc -p tsconfig.build.json

echo "✅ TypeScript compilation completed"
