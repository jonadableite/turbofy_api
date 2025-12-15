#!/bin/bash
# Script para testar o build Docker localmente antes de commitar
# Este script simula o que acontece no Dockerfile

set -e

echo "🧪 Testando build Docker localmente (API independente)..."
echo ""

# Garantir que estamos em api/
if [ ! -f "package.json" ] || [ ! -d "prisma" ]; then
  echo "❌ Erro: Execute este script dentro do diretório api/"
  exit 1
fi

echo "📦 1. Verificando instalação de dependências..."
if [ ! -d "node_modules" ]; then
  echo "⚠️  node_modules não encontrado. Execute: npm install"
  exit 1
fi
echo "✅ Dependências instaladas"
echo ""

echo "🔄 2. Testando geração do Prisma Client..."
DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy" \
  npm run prisma:generate
echo "✅ Prisma Client gerado com sucesso"
echo ""

echo "📝 3. Testando build TypeScript da API..."
npm run build
echo "✅ Build TypeScript concluído"
echo ""

echo "🎉 Todos os testes passaram! O build Docker deve funcionar."
echo ""
echo "💡 Próximos passos:"
echo "   1. Commit as mudanças"
echo "   2. Push para o repositório"
echo "   3. O build na nuvem deve funcionar agora"
