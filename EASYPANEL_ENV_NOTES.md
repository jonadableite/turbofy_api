# 📝 Notas de Configuração - EasyPanel

## ⚠️ Importante: Formato da DATABASE_URL

A `DATABASE_URL` no EasyPanel **NÃO deve ter aspas** e deve usar `postgresql://` (não `postgres://`).

### ❌ ERRADO:
```
DATABASE_URL="postgres://postgres:senha@host:5432/db"
```

### ✅ CORRETO:
```
DATABASE_URL=postgresql://postgres:senha@host:5432/db?sslmode=disable
```

## 🔧 Variáveis de Ambiente Recomendadas

Copie e cole no EasyPanel (sem aspas nas URLs, exceto onde especificado):

```env
NODE_ENV=production
PORT=3030
DATABASE_URL=postgresql://postgres:c4102143751b6e25d238@painel.whatlead.com.br:5432/turbofy?sslmode=disable
JWT_SECRET=a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6
RECAPTCHA_SECRET_KEY=6LcUtwksAAAAADTGc6UTx1wBsiZlVHuauE-7P1AM
CACHE_REDIS_URI=redis://default:91238983Jonadab@painel.whatlead.com.br:6379
RABBITMQ_URI=amqp://guest:guest@31.97.254.58
SMTP_SENDER_EMAIL=TurboFY <contato@turbofypay.com>
SMTP_HOST=smtp.zoho.com
SMTP_PORT=587
SMTP_USERNAME=contato@turbofypay.com
SMTP_PASSWORD=Xdjonadab510*@
SMTP_AUTH_DISABLED=false
FRONTEND_URL=https://app.turbofypay.com
CORS_ORIGIN=https://app.turbofypay.com
TRANSFEERA_ENABLED=true
TRANSFEERA_CLIENT_ID=seu_client_id
TRANSFEERA_CLIENT_SECRET=seu_client_secret
TRANSFEERA_API_URL=https://api-sandbox.transfeera.com
TRANSFEERA_LOGIN_URL=https://login-api-sandbox.transfeera.com
TRANSFEERA_PIX_KEY=email@exemplo.com
TRANSFEERA_WEBHOOK_SECRET=seu_secret_minimo_32_caracteres_aqui

# Panda Video (Opcional - apenas se usar vídeos)
PANDAS_APIKEY=sua_api_key_do_panda_video
```

## 🔍 Problemas Comuns

### Erro: "Can't reach database server"

1. **Verifique se a DATABASE_URL está correta** (sem aspas, usando `postgresql://`)
2. **Verifique se o banco está acessível** do servidor EasyPanel
3. **Verifique firewall/rede** - o banco precisa aceitar conexões do IP do servidor
4. **Aguarde alguns segundos** - o script `wait-for-db.js` tenta conectar por até 2 minutos

### Migrations falham mas servidor inicia

Isso é normal se as migrations já foram aplicadas. O servidor continuará funcionando mesmo se o migrate deploy falhar.

## 📊 Health Check

O health check está configurado em `/healthz` na porta definida por `PORT` (padrão: 3030).

