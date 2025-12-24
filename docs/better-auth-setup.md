# Better Auth - Configuração e Migração

Este documento descreve como configurar e migrar o sistema de autenticação para o Better Auth.

## Variáveis de Ambiente

Adicione as seguintes variáveis ao seu arquivo `.env`:

```bash
# Better Auth Configuration
BETTER_AUTH_SECRET=sua-chave-secreta-de-pelo-menos-32-caracteres
BETTER_AUTH_URL=http://localhost:3000
```

### Descrição das Variáveis

| Variável | Descrição | Obrigatório |
|----------|-----------|-------------|
| `BETTER_AUTH_SECRET` | Chave secreta para criptografia e tokens. Mínimo 32 caracteres. | Sim |
| `BETTER_AUTH_URL` | URL base do servidor de autenticação. | Sim |

### Gerando o BETTER_AUTH_SECRET

Você pode gerar um secret seguro usando:

```bash
# Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# OpenSSL
openssl rand -hex 32
```

## Migração de Banco de Dados

### 1. Gerar Migration do Prisma

Após atualizar o schema, execute:

```bash
cd turbofy_api
npx prisma migrate dev --name add-better-auth-tables
```

### 2. Migrar Usuários Existentes

Execute o script de migração para criar registros na tabela Account:

```bash
# Migrar usuários
npx ts-node scripts/migrate-users-to-better-auth.ts migrate

# Verificar status da migração
npx ts-node scripts/migrate-users-to-better-auth.ts verify

# Rollback (se necessário)
npx ts-node scripts/migrate-users-to-better-auth.ts rollback --confirm
```

O script:
- É **idempotente** - pode ser executado múltiplas vezes
- Preserva senhas bcrypt existentes
- Cria registros na tabela `Account` com `providerId: "credential"`
- Atualiza campos `name` e `emailVerified` dos usuários

## Estrutura do Banco de Dados

### Novas Tabelas

#### `session`
Armazena sessões de autenticação.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | string | ID único da sessão |
| userId | string | FK para User |
| token | string | Token único da sessão |
| expiresAt | datetime | Data de expiração |
| ipAddress | string? | IP do cliente |
| userAgent | string? | User agent do browser |
| impersonatedBy | string? | ID do admin (Admin Plugin) |

#### `account`
Vincula contas de autenticação ao usuário.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | string | ID único |
| userId | string | FK para User |
| accountId | string | ID externo ou ID do usuário |
| providerId | string | "credential", "google", etc. |
| password | string? | Hash da senha (bcrypt) |
| accessToken | string? | Token OAuth |
| refreshToken | string? | Refresh token OAuth |

#### `verification`
Tokens de verificação (email, reset password).

| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | string | ID único |
| identifier | string | Email ou identificador |
| value | string | Token |
| expiresAt | datetime | Expiração |

### Campos Adicionados ao `User`

| Campo | Tipo | Descrição |
|-------|------|-----------|
| name | string? | Nome do usuário |
| emailVerified | boolean | Se email foi verificado |
| image | string? | URL da foto de perfil |
| role | string? | Role do Admin Plugin |
| banned | boolean? | Se usuário está banido |
| banReason | string? | Motivo do ban |
| banExpires | datetime? | Quando o ban expira |

## Endpoints Better Auth

Os endpoints são montados automaticamente em `/api/auth/*`:

### Autenticação
- `POST /api/auth/sign-up/email` - Cadastro
- `POST /api/auth/sign-in/email` - Login
- `POST /api/auth/sign-out` - Logout
- `GET /api/auth/get-session` - Obter sessão

### Admin (Plugin)
- `GET /api/auth/admin/list-users` - Listar usuários
- `POST /api/auth/admin/set-role` - Alterar role
- `POST /api/auth/admin/ban-user` - Banir usuário
- `POST /api/auth/admin/unban-user` - Desbanir usuário

### Verificação
- `POST /api/auth/request-password-reset` - Solicitar reset de senha
- `POST /api/auth/reset-password` - Resetar senha

## Integração com Express

O handler do Better Auth é montado em `src/index.ts`:

```typescript
import { toNodeHandler } from "better-auth/node";
import { auth } from "./infrastructure/auth/better-auth";

// IMPORTANTE: Montar ANTES do express.json()
app.all("/api/auth/*", toNodeHandler(auth));
```

## Middleware de Autenticação

Para proteger rotas, use o middleware Better Auth:

```typescript
import { betterAuthMiddleware, requireAdmin } from "./middlewares/betterAuthMiddleware";

// Rota protegida (qualquer usuário autenticado)
router.get("/protected", betterAuthMiddleware, (req, res) => {
  res.json({ user: req.user });
});

// Rota apenas para admins
router.get("/admin", betterAuthMiddleware, requireAdmin, (req, res) => {
  res.json({ admin: true });
});
```

## Frontend (Next.js)

### Configuração do Cliente

```typescript
// src/lib/auth-client.ts
import { createAuthClient } from "better-auth/react";
import { adminClient, inferAdditionalFields } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  plugins: [
    adminClient(),
    inferAdditionalFields({
      user: {
        roles: { type: "string[]" },
        document: { type: "string" },
        // ... outros campos
      },
    }),
  ],
  fetchOptions: {
    credentials: "include",
  },
});

export const { useSession, signIn, signUp, signOut } = authClient;
```

### Uso em Componentes

```tsx
import { useSession, signIn, signOut } from "@/lib/auth-client";

function MyComponent() {
  const { data: session, isPending } = useSession();

  if (isPending) return <Loading />;
  
  if (!session) {
    return (
      <button onClick={() => signIn.email({ email, password })}>
        Login
      </button>
    );
  }

  return (
    <div>
      <p>Olá, {session.user.email}</p>
      <button onClick={() => signOut()}>Logout</button>
    </div>
  );
}
```

## Compatibilidade

### Senhas Existentes (bcrypt)

O Better Auth está configurado para usar bcrypt para hash de senhas, mantendo compatibilidade com senhas existentes:

```typescript
emailAndPassword: {
  password: {
    hash: async (password) => bcrypt.hash(password, 12),
    verify: async ({ hash, password }) => bcrypt.compare(password, hash),
  },
},
```

### Campos Customizados

Os campos customizados do modelo User são configurados em `additionalFields`:

```typescript
user: {
  additionalFields: {
    roles: { type: "string[]", defaultValue: ["BUYER"] },
    document: { type: "string", required: true },
    kycStatus: { type: "string", defaultValue: "UNVERIFIED" },
    // ...
  },
},
```

## Troubleshooting

### Erro: "Unauthorized" após login
- Verifique se os cookies estão sendo enviados (`credentials: "include"`)
- Verifique se o domínio está na lista `trustedOrigins`
- Verifique se o CORS está configurado com `credentials: true`

### Erro: "Session not found"
- Execute o script de migração de usuários
- Verifique se as tabelas `session` e `account` existem

### Erro: "Invalid password"
- Verifique se o usuário foi migrado (tem registro em `account`)
- Verifique se o hash bcrypt está correto
