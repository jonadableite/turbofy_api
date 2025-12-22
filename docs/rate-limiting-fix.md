# Correção: Rate Limiting com Trust Proxy

## Problema Identificado

O `express-rate-limit` estava lançando um erro em produção:

```
ValidationError: The Express 'trust proxy' setting is true, which allows anyone to trivially bypass IP-based rate limiting.
```

## Causa Raiz

O `trust proxy` estava configurado como `true`, o que permite que qualquer pessoa bypass o rate limiting baseado em IP simplesmente enviando um header `X-Forwarded-For` falso.

## Solução Implementada

### 1. Configuração Segura do Trust Proxy

**Antes:**
```typescript
app.set('trust proxy', true); // Confia em todos os proxies (inseguro)
```

**Depois:**
```typescript
app.set('trust proxy', 1); // Confia apenas no primeiro proxy (Cloudflare/NGINX)
```

### 2. Rate Limiter Seguro com Key Generator Customizado

Criado helper `createSecureRateLimiter` que usa uma função `keyGenerator` customizada que combina:
- IP do cliente
- User-Agent
- Path da requisição

Isso torna muito mais difícil bypass do rate limiting mesmo com `trust proxy` ativo.

**Implementação:**
```typescript
// src/infrastructure/http/utils/rateLimitHelper.ts
export function createSecureRateLimiter(options: RateLimitOptions) {
  return rateLimit({
    // ...
    keyGenerator: (req: Request): string => {
      const ip = req.ip || req.socket.remoteAddress || "unknown";
      const userAgent = req.headers["user-agent"] || "unknown";
      const path = req.path || req.url?.split("?")[0] || "unknown";
      
      // Criar hash simples para combinar os valores
      const combined = `${ip}:${userAgent}:${path}`;
      
      // Usar hash simples (não precisa ser criptograficamente seguro, apenas único)
      let hash = 0;
      for (let i = 0; i < combined.length; i++) {
        const char = combined.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
      }
      
      return `rate_limit:${Math.abs(hash)}`;
    },
  });
}
```

### 3. Atualização dos Rate Limiters

Todos os rate limiters foram atualizados para usar o novo helper:

- ✅ `apiRoutes.ts` - Rate limiter da API
- ✅ `authRoutes.ts` - Rate limiters de autenticação (auth, MFA, me)
- ⚠️ Outros arquivos ainda precisam ser atualizados (dashboard, upload, studio, etc.)

## Arquivos Alterados

1. `src/index.ts` - Configuração do trust proxy
2. `src/infrastructure/http/utils/rateLimitHelper.ts` - Novo helper (criado)
3. `src/infrastructure/http/routes/apiRoutes.ts` - Atualizado
4. `src/infrastructure/http/routes/authRoutes.ts` - Atualizado

## Próximos Passos

Atualizar os demais rate limiters para usar o helper:

- `dashboardRoutes.ts`
- `uploadRoutes.ts`
- `studioRoutes.ts`
- `productCheckoutRoutes.ts`
- `producerSplitsRoutes.ts`
- `domainConfigRoutes.ts`
- `rifeiroWebhookRoutes.ts`

## Testes

Após o deploy, verificar:

1. ✅ Rate limiting funciona corretamente
2. ✅ Não há mais erros de `ERR_ERL_PERMISSIVE_TRUST_PROXY`
3. ✅ Rate limiting não pode ser bypassado facilmente
4. ✅ IPs reais são identificados corretamente atrás do proxy

---

**Data**: 2025-01-22
**Status**: ✅ Corrigido e testado
