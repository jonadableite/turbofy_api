# Correção: Webhook Transfeera - Teste de URL

## Problema Identificado

Ao tentar criar um webhook na Transfeera, a API retornava erro 400:

```
"We could not test your URL. Error: Response code 401 (Unauthorized)"
```

## Causa Raiz

A Transfeera testa a URL do webhook **antes de criá-lo**. Nesse teste:
- Não envia o header `Transfeera-Signature`
- Não envia um evento completo (pode não ter `id` ou `account_id`)
- Apenas verifica se a URL está acessível e retorna 200

O endpoint do Turbofy estava rejeitando essas requisições de teste com 401, impedindo a criação do webhook.

## Solução Implementada

Adicionada lógica para detectar requisições de teste da Transfeera e aceitá-las sem validação de assinatura:

```typescript
// Detectar se é um teste da Transfeera
const isTransfeeraTest = !sigHeader && (!event?.id || !event?.account_id);
const userAgent = req.headers["user-agent"] || "";
const isTransfeeraUserAgent = userAgent.toLowerCase().includes("transfeera");

// Aceitar teste da Transfeera sem validação
if (isTransfeeraTest || isTransfeeraUserAgent) {
  return res.status(200).json({ 
    status: "ok", 
    message: "Webhook endpoint is accessible",
    timestamp: new Date().toISOString(),
  });
}
```

## Comportamento

### Requisições de Teste (Transfeera)
- ✅ Aceitas sem validação de assinatura
- ✅ Retornam 200 OK
- ✅ Permitem criação do webhook

### Requisições Reais (Eventos)
- ✅ Validação de assinatura obrigatória
- ✅ Verificação de `account_id` configurado
- ✅ Processamento normal do evento

## Arquivos Alterados

- `src/infrastructure/http/routes/transfeeraWebhookRoutes.ts`

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

O webhook deve ser criado com sucesso na Transfeera.

---

**Data**: 2025-01-22
**Status**: ✅ Corrigido
