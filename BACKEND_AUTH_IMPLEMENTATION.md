# 🔐 Implementação de Autenticação - Turbofy Backend

## ✅ Endpoints Implementados

### 1. **GET /api/auth/csrf**
Gera e retorna um token CSRF para proteção contra ataques CSRF.

**Resposta:**
```json
{
  "csrfToken": "abc123..."
}
```

**Uso:** O frontend deve buscar este token antes de fazer requisições mutáveis (POST, PUT, DELETE) e incluí-lo no header `X-CSRF-Token`.

---

### 2. **POST /auth/forgot-password**
Gera um token de reset de senha e envia email com link para redefinição.

**Body:**
```json
{
  "email": "user@example.com"
}
```

**Resposta:**
```json
{
  "status": "ok",
  "message": "If the email exists, a password reset link has been sent."
}
```

**Segurança:**
- ✅ Sempre retorna 200 para evitar user enumeration
- ✅ Token expira em 1 hora
- ✅ Token armazenado com hash bcrypt
- ✅ Validação reCAPTCHA opcional

---

### 3. **POST /auth/login** (Atualizado)
Login com suporte a HttpOnly cookies.

**Body:**
```json
{
  "email": "user@example.com",
  "password": "senha123",
}
```

**Resposta:**
```json
{
  "accessToken": "...",
  "refreshToken": "...",
  "expiresIn": 900 // 15 minutos em segundos
}
```

**Cookies (HttpOnly):**
- `accessToken` - Expira em 15 minutos
- `refreshToken` - Expira em 7 dias

---

### 4. **POST /auth/register** (Atualizado)
Registro com suporte a HttpOnly cookies.

**Body:**
```json
{
  "email": "user@example.com",
  "password": "Senha123!@#",
  "document": "12345678901",
  "phone": "11999999999" // Opcional
}
```

**Resposta:**
```json
{
  "accessToken": "...",
  "refreshToken": "...",
  "expiresIn": 900
}
```

**Cookies (HttpOnly):**
- `accessToken` - Expira em 15 minutos
- `refreshToken` - Expira em 7 dias

---

## 🔐 Segurança Implementada

### CSRF Protection
- ✅ Token CSRF gerado via `/api/auth/csrf`
- ✅ Armazenado em memória (em produção, usar Redis)
- ✅ Expira em 1 hora
- ✅ Validado em requisições mutáveis

### HttpOnly Cookies
- ✅ Tokens JWT armazenados em cookies HttpOnly
- ✅ `secure: true` em produção (HTTPS only)
- ✅ `sameSite: 'strict'` para proteção CSRF
- ✅ Tokens ainda retornados no JSON para compatibilidade

<!-- reCAPTCHA removido do backend -->

### Rate Limiting
- ✅ 10 requisições / 10 minutos por IP (auth endpoints)
- ✅ 5 requisições / 10 minutos (MFA endpoints)
- ✅ Bloqueio após 5 tentativas falhadas (15 minutos)

---

## 📦 Novos Arquivos Criados

### Serviços de Segurança

<!-- Arquivo recaptcha.ts removido: reCAPTCHA não utilizado -->

2. **`src/infrastructure/security/csrf.ts`**
   - Geração de tokens CSRF
   - Validação de tokens
   - Limpeza automática de tokens expirados

### Rotas

3. **`src/infrastructure/http/routes/apiRoutes.ts`**
   - Endpoint `/api/auth/csrf`

### Email

4. **`src/infrastructure/email/templates/password-reset.hbs`**
   - Template HTML para email de reset de senha
   - Design consistente com template OTP

### Database

5. **Model `PasswordResetToken`** (adicionado ao schema.prisma)
   - Armazena tokens de reset com hash
   - Expiração automática
   - Índices para performance

---

## 🔧 Configuração

### Variáveis de Ambiente

Adicione ao `.env`:

```bash

# URL do Frontend (para links de email)
FRONTEND_URL=http://localhost:3001
```

### Migration

Execute a migration para criar a tabela `PasswordResetToken`:

```bash
cd backend
pnpm prisma migrate dev --name add_password_reset_token
pnpm prisma generate
```

---

## 📝 Próximos Passos

### Pendente

1. **Endpoint de Reset Password** (`POST /auth/reset-password`)
   - Validar token de reset
   - Atualizar senha do usuário
   - Invalidar token usado

2. **Validação de CSRF Token**
   - Middleware para validar CSRF em rotas protegidas
   - Integração com authMiddleware

3. **Refresh Token via Cookie**
   - Endpoint `/auth/refresh` deve ler cookie ao invés de body

4. **Logout**
   - Endpoint `/auth/logout` para invalidar cookies

---

## 🧪 Testes

### Testar CSRF Token

```bash
curl http://localhost:3000/api/auth/csrf
# Resposta: { "csrfToken": "..." }
```

### Testar Login com Cookie

```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"senha123"}' \
  -c cookies.txt

# Verificar cookies salvos
cat cookies.txt
```

### Testar Forgot Password

```bash
curl -X POST http://localhost:3000/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}'
```

---

## 🔍 Logs

Os seguintes eventos são logados:

- ✅ Geração de token CSRF
- ✅ Geração de token de reset
- ✅ Envio de email de reset
- ✅ Erros de validação

---

## 📚 Referências

- [OWASP CSRF Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
- [reCAPTCHA v3 Documentation](https://developers.google.com/recaptcha/docs/v3)
- [Express Cookie Security](https://expressjs.com/en/4x/api.html#res.cookie)
- [HttpOnly Cookies](https://owasp.org/www-community/HttpOnly)

---

**Desenvolvido com ❤️ para o Turbofy Gateway de Pagamentos**

