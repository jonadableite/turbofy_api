#!/bin/bash

# Script para configurar HTTPS local usando mkcert
# Uso: ./scripts/setup-https.sh

set -e

echo "🔒 Configurando HTTPS local com mkcert..."
echo ""

# Verificar se mkcert está instalado
if ! command -v mkcert &> /dev/null; then
    echo "❌ mkcert não está instalado."
    echo ""
    echo "Para instalar no macOS:"
    echo "  brew install mkcert"
    echo ""
    echo "Para instalar no Linux:"
    echo "  # Veja: https://github.com/FiloSottile/mkcert#installation"
    echo ""
    exit 1
fi

# Verificar se a CA está instalada
if ! mkcert -CAROOT &> /dev/null; then
    echo "📦 Instalando Certificate Authority local..."
    mkcert -install
    echo "✅ CA instalada com sucesso!"
    echo ""
else
    echo "✅ CA já está instalada."
    echo ""
fi

# Criar diretório de certificados
CERT_DIR="certs"
mkdir -p "$CERT_DIR"

# Gerar certificados
echo "🔐 Gerando certificados para localhost..."
cd "$CERT_DIR"
mkcert localhost 127.0.0.1 ::1
cd ..

echo ""
echo "✅ Certificados gerados com sucesso!"
echo ""
echo "📁 Arquivos criados:"
echo "  - $CERT_DIR/localhost+2.pem (certificado)"
echo "  - $CERT_DIR/localhost+2-key.pem (chave privada)"
echo ""
echo "📝 Adicione ao seu .env:"
echo ""
echo "  HTTPS_ENABLED=true"
echo "  HTTPS_CERT_PATH=./certs/localhost+2.pem"
echo "  HTTPS_KEY_PATH=./certs/localhost+2-key.pem"
echo "  HTTPS_PORT=3443"
echo ""
echo "🚀 Reinicie o servidor para aplicar as mudanças!"
echo ""
