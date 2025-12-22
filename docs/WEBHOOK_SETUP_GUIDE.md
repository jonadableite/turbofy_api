# 🚀 Guia de Configuração de Webhooks - Turbofy

## Resumo Rápido

**Sim, você precisa criar a URL na Transfeera!** Mas o Turbofy facilita isso com endpoints e scripts automáticos.

## Fluxo Completo

```
1. Merchant configura webhook na Transfeera → Turbofy
   ↓
2. Cliente paga PIX
   ↓
3. Transfeera envia webhook → Turbofy
   ↓
4. Turbofy processa e atualiza charge
   ↓
5. Turbofy envia webhook → Integrador (seu cliente)
```

## Passo a Passo

### 1. Configurar Webhook na Transfeera (Uma vez)

**Opção A: Script Automático (Recomendado)**

```bash
cd turbofy_api
npx ts-node scripts/setup-transfeera-webhook.ts
```

Este script:
- ✅ Verifica se já existe webhook
- ✅ Cria na Transfeera apontando para `https://api.turbofypay.com/webhooks/transfeera`
- ✅ Salva configuração no banco
- ✅ Testa o webhook

**Opção B: Via API**

```bash
curl -X POST https://api.turbofypay.com/rifeiro/webhooks \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://api.turbofypay.com/webhooks/transfeera",
    "objectTypes": ["CashIn", "Transfer", "CashInRefund"]
  }'
```

**O que acontece:**
- Turbofy cria webhook na Transfeera via `POST https://api.transfeera.com/webhook`
- Transfeera retorna `webhookId` e `signatureSecret`
- Turbofy salva no banco para validar assinaturas futuras

### 2. Quando Cliente Paga PIX

1. Cliente escaneia QR Code e paga
2. Transfeera processa pagamento
3. **Transfeera envia webhook para Turbofy** (`POST /webhooks/transfeera`)

### 3. Turbofy Processa Webhook

**Endpoint:** `POST /webhooks/transfeera` (público, sem autenticação)

**O que o Turbofy faz:**
1. ✅ Valida assinatura HMAC (`Transfeera-Signature`)
2. ✅ Busca charge pelo `txid` ou `integration_id`
3. ✅ Atualiza charge para `PAID`
4. ✅ Cria `PaymentInteraction` (auditoria)
5. ✅ Publica evento `charge.paid` no RabbitMQ

### 4. Turbofy Notifica Integrador

O `ChargePaidConsumer` processa `charge.paid` e:
1. Cria Enrollment (se for curso)
2. **Dispara webhook para o integrador** via `DispatchWebhooks`

**Webhook enviado para o integrador:**
```json
{
  "event": "charge.paid",
  "data": {
    "chargeId": "charge-uuid",
    "status": "PAID",
    "amountCents": 10000,
    "currency": "BRL",
    "method": "PIX",
    "externalRef": "order:123",
    "metadata": { ... },
    "paidAt": "2025-01-22T10:00:00.000Z"
  },
  "timestamp": "2025-01-22T10:00:00.000Z"
}
```

## Verificação

### Verificar se Webhook está Configurado

```bash
curl -X GET https://api.turbofypay.com/rifeiro/webhooks \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Verificar Eventos na Transfeera

```bash
npx ts-node scripts/verify-transfeera-webhooks.ts
```

### Verificar Tentativas de Webhook

```bash
curl -X GET https://api.turbofypay.com/webhooks/transfeera/status
```

### Consultar Eventos na Transfeera (API Direta)

```bash
curl -X GET "https://api.transfeera.com/webhook/event?initialDate=2025-01-22T00:00:00Z&endDate=2025-01-22T23:59:59Z&page=1&objectType=CashIn" \
  -H "User-Agent: Turbofy/1.0 (contato@turbofy.com)" \
  -H "Authorization: Bearer TRANSFEERA_TOKEN"
```

## Troubleshooting

### Webhook não está sendo recebido

1. **Verificar configuração:**
   ```bash
   npx ts-node scripts/verify-transfeera-webhooks.ts
   ```

2. **Verificar logs:**
   ```bash
   grep "Webhook Transfeera received" /var/log/turbofy/api.log
   ```

3. **Verificar URL:**
   ```bash
   curl -I https://api.turbofypay.com/webhooks/transfeera/health
   ```

### Charge não está sendo atualizada

1. **Verificar matching:**
   - `txid` do webhook = `pixTxid` da charge
   - OU `integration_id` = `externalRef`

2. **Verificar logs:**
   ```bash
   grep "Charge marked as paid" /var/log/turbofy/api.log
   ```

### Integrador não recebe webhook

1. **Verificar se integrador configurou webhook:**
   ```sql
   SELECT * FROM "Webhook" 
   WHERE merchant_id = '<merchant-id>' 
   AND active = true;
   ```

2. **Verificar tentativas:**
   ```sql
   SELECT * FROM "WebhookDelivery" 
   WHERE merchant_id = '<merchant-id>' 
   ORDER BY created_at DESC 
   LIMIT 10;
   ```

## Resumo

✅ **Sim, precisa criar webhook na Transfeera** (mas Turbofy faz isso automaticamente via API)

✅ **URL do webhook:** `https://api.turbofypay.com/webhooks/transfeera`

✅ **Fluxo completo:**
1. Merchant configura webhook (uma vez)
2. Cliente paga PIX
3. Transfeera → Turbofy (webhook)
4. Turbofy processa e atualiza charge
5. Turbofy → Integrador (webhook)

✅ **Scripts disponíveis:**
- `setup-transfeera-webhook.ts` - Configurar automaticamente
- `verify-transfeera-webhooks.ts` - Verificar configuração
- `test-webhook-flow.ts` - Testar fluxo completo

---

**Dica**: Execute `npx ts-node scripts/setup-transfeera-webhook.ts` para configurar tudo automaticamente!
