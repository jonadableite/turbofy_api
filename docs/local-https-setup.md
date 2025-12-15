# 🔒 Configuração HTTPS para Desenvolvimento Local

Este guia explica como configurar HTTPS no ambiente de desenvolvimento local do Turbofy.

## 📋 Opções Disponíveis

### 1. **mkcert** (Recomendado para desenvolvimento local)
- ✅ Certificados válidos localmente (sem warnings do navegador)
- ✅ Funciona com todos os navegadores
- ✅ Ideal para desenvolvimento frontend/backend local
- ❌ Não expõe publicamente (apenas localhost)

### 2. **ngrok** (Recomendado para webhooks externos)
- ✅ Túnel HTTPS público (acessível de fora)
- ✅ Ideal para testar webhooks da Transfeera
- ✅ URL pública temporária
- ❌ Requer conta gratuita (limite de conexões)

---

## 🚀 Opção 1: mkcert (HTTPS Local)

### Passo 1: Instalar mkcert

```bash
# macOS (via Homebrew)
brew install mkcert

# Ou via MacPorts
sudo port install mkcert
```

### Passo 2: Instalar CA local

```bash
# Criar e instalar a Certificate Authority local
mkcert -install
```

Isso adiciona uma CA confiável no seu sistema. Você verá algo como:
```
Created a new local CA at "/Users/seu-usuario/Library/Application Support/mkcert" ✨
The local CA is now installed in the system trust store! ⚠️ The root CA certificate is at:
/Users/seu-usuario/Library/Application Support/mkcert/rootCA.pem
```

### Passo 3: Gerar certificados para localhost

```bash
# Criar diretório para certificados (se não existir)
mkdir -p apps/api/certs

# Gerar certificado para localhost (válido para localhost, 127.0.0.1, ::1)
cd apps/api/certs
mkcert localhost 127.0.0.1 ::1

# Isso cria:
# - localhost+2.pem (certificado)
# - localhost+2-key.pem (chave privada)
```

### Passo 4: Configurar variáveis de ambiente

Adicione no `apps/api/.env`:

```env
# HTTPS Local (mkcert)
HTTPS_ENABLED=true
HTTPS_CERT_PATH=./certs/localhost+2.pem
HTTPS_KEY_PATH=./certs/localhost+2-key.pem
HTTPS_PORT=3443
```

### Passo 5: Reiniciar o servidor

```bash
pnpm run dev
```

O servidor agora estará disponível em:
- **HTTPS**: `https://localhost:3443`
- **HTTP**: `http://localhost:3000` (ainda funciona se `HTTPS_ENABLED=false`)

### Passo 6: Atualizar frontend (se necessário)

Se o frontend precisa chamar a API via HTTPS, atualize `apps/dashboard-vendor/.env.local`:

```env
NEXT_PUBLIC_API_URL=https://localhost:3443
```

---

## 🌐 Opção 2: ngrok (Túnel Público para Webhooks)

### Quando usar ngrok?

- ✅ Testar webhooks da Transfeera em desenvolvimento
- ✅ Compartilhar temporariamente sua API local
- ✅ Testar integrações que exigem URL pública

### Passo 1: Instalar ngrok

```bash
# macOS (via Homebrew)
brew install ngrok/ngrok/ngrok

# Ou baixar de: https://ngrok.com/download
```

### Passo 2: Criar conta e obter authtoken

1. Acesse https://dashboard.ngrok.com/signup
2. Copie seu authtoken do dashboard
3. Configure:

```bash
ngrok config add-authtoken SEU_AUTHTOKEN_AQUI
```

### Passo 3: Iniciar túnel

```bash
# Expor porta 3000 (API) via HTTPS público
ngrok http 3000

# Ou porta 3443 se estiver usando HTTPS local
ngrok http 3443
```

Você verá algo como:
```
Forwarding  https://abc123.ngrok-free.app -> http://localhost:3000
```

### Passo 4: Configurar webhook da Transfeera

Use a URL do ngrok no painel da Transfeera:

```
https://abc123.ngrok-free.app/webhooks/transfeera
```

### Passo 5: (Opcional) ngrok com domínio fixo

Se você tem conta paga do ngrok, pode usar um domínio fixo:

```bash
ngrok http 3000 --domain=seu-dominio.ngrok.app
```

---

## 🔧 Configuração Avançada: Ambos (mkcert + ngrok)

Para ter **HTTPS local** (mkcert) **E** **túnel público** (ngrok):

1. Configure mkcert (Opção 1) para HTTPS local
2. Inicie o servidor na porta HTTPS (3443)
3. Inicie ngrok apontando para a porta HTTPS:

```bash
# Terminal 1: Servidor com HTTPS
pnpm run dev

# Terminal 2: ngrok apontando para HTTPS local
ngrok http 3443
```

Agora você tem:
- **Local**: `https://localhost:3443` (sem warnings)
- **Público**: `https://abc123.ngrok-free.app` (para webhooks)

---

## 📝 Adicionar ao .gitignore

Certifique-se de que os certificados não sejam commitados:

```gitignore
# Certificados SSL locais
apps/api/certs/*.pem
apps/api/certs/*.key
apps/api/certs/*.crt
```

---

## 🐛 Troubleshooting

### Erro: "certificate has expired"
- Regenere os certificados: `mkcert localhost 127.0.0.1 ::1`

### Erro: "self signed certificate"
- Certifique-se de que rodou `mkcert -install`
- Reinicie o navegador após instalar a CA

### ngrok: "tunnel session failed"
- Verifique se o authtoken está configurado corretamente
- Verifique se a porta está correta (3000 ou 3443)

### Frontend não consegue chamar API HTTPS
- Verifique se `NEXT_PUBLIC_API_URL` aponta para `https://localhost:3443`
- No Next.js, pode ser necessário configurar `NODE_TLS_REJECT_UNAUTHORIZED=0` apenas em desenvolvimento (não recomendado para produção)

---

## 📚 Referências

- [mkcert GitHub](https://github.com/FiloSottile/mkcert)
- [ngrok Documentation](https://ngrok.com/docs)
- [Node.js HTTPS](https://nodejs.org/api/https.html)
