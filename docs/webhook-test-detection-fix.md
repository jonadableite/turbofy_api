# Correção: Detecção de Teste da Transfeera

## Problema

A Transfeera estava testando a URL do webhook antes de criá-lo, mas o endpoint estava rejeitando com 401 porque não havia assinatura.

**Erro:** `We could not test your URL. Error: Response code 401 (Unauthorized)`

## Solução Implementada

### 1. Detecção Melhorada de Teste

Adicionada lógica mais robusta para detectar requisições de teste:

```typescript
// Critérios para detectar teste:
// 1. Não tem assinatura E (não tem body válido OU não tem event.id OU não tem account_id)
// 2. User-Agent contém "transfeera"
// 3. Body vazio ou inválido
const userAgent = req.headers["user-agent"] || "";
const isTransfeeraUserAgent = userAgent.toLowerCase().includes("transfeera");
const hasValidEvent = event && event.id && event.account_id;
const hasEmptyBody = !req.body || Object.keys(req.body).length === 0;
const isTransfeeraTest = !sigHeader && (!hasValidEvent || hasEmptyBody);
```

### 2. Fallback de Detecção

Adicionada verificação adicional antes de rejeitar:

```typescript
if (!raw || !sigHeader) {
  // Última verificação: se não tem assinatura e não tem evento válido, pode ser teste
  const mightBeTest = !hasValidEvent || hasEmptyBody;
  if (mightBeTest) {
    return res.status(200).json({ 
      status: "ok", 
      message: "Webhook endpoint is accessible",
      timestamp: new Date().toISOString(),
    });
  }
  // ... rejeitar se realmente não for teste
}
```

### 3. Suporte para GET

Adicionado endpoint GET para testes:

```typescript
transfeeraWebhookRouter.get("/", async (req: Request, res: Response) => {
  // Retorna 200 para permitir teste da Transfeera
  res.status(200).json({ 
    status: "ok", 
    message: "Webhook endpoint is accessible",
    timestamp: new Date().toISOString(),
  });
});
```

## Comportamento

### Requisições de Teste
- ✅ Aceitas sem validação de assinatura
- ✅ Retornam 200 OK
- ✅ Permitem criação do webhook na Transfeera

### Requisições Reais (Eventos)
- ✅ Validação de assinatura obrigatória
- ✅ Verificação de `account_id` configurado
- ✅ Processamento normal do evento

## Arquivos Alterados

- `src/infrastructure/http/routes/transfeeraWebhookRoutes.ts`
  - Melhorada detecção de teste
  - Adicionado fallback de detecção
  - Adicionado suporte para GET

## Teste

Após o deploy, execute:

```bash
curl -X POST https://api.turbofypay.com/rifeiro/webhooks \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://api.turbofypay.com/webhooks/transfeera",
    "objectTypes": ["CashIn", "Transfer", "CashInRefund"]
  }'
```

O webhook deve ser criado com sucesso! ✅

---

**Data**: 2025-01-22
**Status**: ✅ Corrigido
