# 🚀 Guia de Inicialização - Turbofy Backend

## ⚡ Início Rápido

### 1. Instalar Dependências
```bash
cd backend
pnpm install
```

### 2. Configurar Variáveis de Ambiente
```bash
# Copie o arquivo .env.example para .env (se existir)
cp .env.example .env

# Ou crie manualmente com as variáveis necessárias:
# DATABASE_URL=postgresql://user:password@localhost:5432/turbofy
# JWT_SECRET=your-secret-key-minimum-32-characters
# RABBITMQ_URI=amqp://localhost:5672
# SMTP_HOST=smtp.gmail.com
# SMTP_PORT=587
# SMTP_USERNAME=your-email@gmail.com
# SMTP_PASSWORD=your-password
# SMTP_SENDER_EMAIL=noreply@turbofy.com
```

### 3. Gerar Prisma Client
```bash
pnpm prisma generate
```

### 4. Executar Migrations (se necessário)
```bash
pnpm prisma migrate dev
```

### 5. Iniciar Servidor de Desenvolvimento
```bash
pnpm run dev
```

O servidor estará disponível em: `http://localhost:3000`

---

## 🔧 Solução de Problemas

### Erro: "Cannot find module '.prisma/client/default'"
**Solução:**
```bash
pnpm prisma generate
```

### Erro: "Cannot find module 'chalk'"
**Solução:**
```bash
pnpm add chalk
```

### Erro: "DATABASE_URL is not defined"
**Solução:**
1. Crie um arquivo `.env` na pasta `backend/`
2. Adicione a variável `DATABASE_URL` com sua string de conexão PostgreSQL

### Erro: "Port 3000 is already in use"
**Solução:**
1. Encontre o processo usando a porta:
   ```bash
   # Windows
   netstat -ano | findstr :3000
   
   # Linux/Mac
   lsof -i :3000
   ```
2. Encerre o processo ou altere a porta no `.env`:
   ```
   PORT=3001
   ```

---

## ✅ Verificação Rápida

Execute o script de verificação:
```bash
pnpm run check
```

Este script verifica:
- ✅ Prisma Client está gerado
- ✅ Arquivo .env existe
- ✅ Dependências instaladas

---

## 📚 Comandos Úteis

```bash
# Desenvolvimento
pnpm run dev              # Inicia servidor com hot-reload

# Build
pnpm run build            # Compila TypeScript

# Prisma
pnpm prisma:generate      # Gera Prisma Client
pnpm prisma:migrate       # Executa migrations
pnpm prisma:studio        # Abre Prisma Studio (GUI)

# Testes
pnpm test                 # Executa testes

# Verificação
pnpm run check            # Verifica ambiente
```

---

## 🎯 Endpoints Disponíveis

Após iniciar o servidor, você verá um banner colorido com todos os endpoints disponíveis:

- `POST /auth/register` - Criar conta
- `POST /auth/login` - Fazer login
- `POST /auth/forgot-password` - Recuperar senha
- `GET /api/auth/csrf` - Token CSRF
- `POST /charges` - Criar cobrança
- `GET /docs` - Documentação Swagger
- `GET /healthz` - Health check

---

## 🐛 Debug

### Logs Detalhados
Os logs agora são muito mais limpos e fáceis de ler:
```
22:33:40 INFO  ✅ POST /auth/login → 200 45ms
22:33:41 WARN  ⚠️ POST /auth/login → 401 32ms
22:33:42 ERROR ❌ POST /charges → 500 ERROR: Database connection failed
```

### Verificar Logs
- **INFO** (azul) - Operações normais
- **WARN** (amarelo) - Avisos
- **ERROR** (vermelho) - Erros

---

**Desenvolvido com ❤️ para o Turbofy Gateway de Pagamentos**

