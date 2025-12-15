# Variáveis de Ambiente - Backend Turbofy

## Variáveis Obrigatórias

```bash
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/turbofy

# JWT
JWT_SECRET=your-super-secret-jwt-key-minimum-32-characters-long

# RabbitMQ
RABBITMQ_URI=amqp://localhost:5672

# SMTP (Email)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=your-email@gmail.com
SMTP_PASSWORD=your-app-password
SMTP_SENDER_EMAIL=noreply@turbofy.com
SMTP_AUTH_DISABLED=false
```

## Variáveis Opcionais (Novas)

```bash
# Google reCAPTCHA v3 Secret Key
# Obter em: https://www.google.com/recaptcha/admin
RECAPTCHA_SECRET_KEY=6Lc...your_secret_key_here

# URL do Frontend (para links de email)
FRONTEND_URL=http://localhost:3001

# CORS Origin (restringir em produção)
CORS_ORIGIN=http://localhost:3001

# Transfeera API Configuration (opcional - para integração com Transfeera)
# Habilitar/desabilitar Transfeera
TRANSFEERA_ENABLED=false

# Credenciais da Transfeera (obtidas na plataforma)
# Sandbox: https://app-sandbox.transfeera.com > Minha Conta > Credenciais de APIs
# Produção: https://app.transfeera.com > Minha Conta > Credenciais de APIs
TRANSFEERA_CLIENT_ID=b2f8fc49-3211-4597-9c73-2b4d421e1c87
TRANSFEERA_CLIENT_SECRET=7d5d4d22-f997-4265-9f60-e008f7e0000d4e427d20-e32d-46ac-824c-51d2997b75e2

# URLs da API (sandbox por padrão)
TRANSFEERA_API_URL=https://api-sandbox.transfeera.com
TRANSFEERA_LOGIN_URL=https://login-api-sandbox.transfeera.com
# Conta Certa (validação bancária/Pix) - credenciais dedicadas
CONTACERTA_API_URL=https://contacerta-api-sandbox.transfeera.com
CONTACERTA_CLIENT_ID=5f93e7d3-e5ed-423f-be25-a684f62714ca
CONTACERTA_CLIENT_SECRET=0fd77ae1-0d35-49ae-8484-c5c029650058811e82f5-4fc8-4618-9c60-35aa890b2242
CONTACERTA_LOGIN_URL=https://login-api-sandbox.transfeera.com

# Chave Pix registrada na Transfeera para recebimentos
TRANSFEERA_PIX_KEY=your_pix_key@example.com

# Secret para validar assinatura de webhooks da Transfeera (opcional em desenvolvimento)
TRANSFEERA_WEBHOOK_SECRET=your_webhook_secret_minimum_32_characters

# Node Environment
NODE_ENV=development

# Porta do servidor
PORT=3000
```

## Como Configurar

1. Copie o arquivo `.env.example` para `.env`:
   ```bash
   cp .env.example .env
   ```

2. Edite o `.env` com suas credenciais reais

3. **IMPORTANTE**: Nunca commite o arquivo `.env` com credenciais reais!

## reCAPTCHA v3

### Obter Chaves

1. Acesse: https://www.google.com/recaptcha/admin
2. Clique em "+" para criar um novo site
3. Escolha "reCAPTCHA v3"
4. Adicione os domínios:
   - `localhost` (desenvolvimento)
   - Seu domínio de produção
5. Copie a **Secret Key** e cole no `.env` como `RECAPTCHA_SECRET_KEY`

### Nota

- A **Site Key** (pública) vai no frontend como `NEXT_PUBLIC_RECAPTCHA_SITE_KEY`
- A **Secret Key** (privada) vai no backend como `RECAPTCHA_SECRET_KEY`

## SMTP

### Gmail (Exemplo)

1. Ative "Acesso a app menos seguro" ou use "Senha de app"
2. Gere uma senha de app em: https://myaccount.google.com/apppasswords
3. Use:
   ```
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USERNAME=seu-email@gmail.com
   SMTP_PASSWORD=senha-de-app-gerada
   ```

### Desenvolvimento Local

Para desenvolvimento sem SMTP real, defina:
```bash
SMTP_AUTH_DISABLED=true
```

Os emails serão logados mas não enviados.

## Validação

O backend valida todas as variáveis obrigatórias na inicialização. Se alguma estiver faltando ou inválida, o servidor não iniciará.

---

**Desenvolvido com ❤️ para o Turbofy Gateway de Pagamentos**

