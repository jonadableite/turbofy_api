# Fluxo Completo de Webhooks - Turbofy → Integradores

## Visão Geral

O Turbofy atua como intermediário entre a Transfeera (adquirente) e os integradores (usuários do Turbofy):

```
Transfeera → Turbofy → Integrador
   (PIX pago)  (processa)  (notifica)
```

## Fluxo Detalhado

### 1. Configuração Inicial (Uma vez por Merchant)

O merchant precisa criar um webhook na Transfeera apontando para o Turbofy:

**Endpoint:** `POST /rifeiro/webhooks`

**Request:**
```json
{
  "url": "https://api.turbofypay.com/webhooks/transfeera",
  "objectTypes": ["CashIn", "Transfer", "CashInRefund"]
}
```

**Response:**
```json
{
  "id": "webhook-config-id",
  "webhookId": "transfeera-webhook-id",
  "accountId": "transfeera-account-id",
  "url": "https://api.turbofypay.com/webhooks/transfeera",
  "objectTypes": ["CashIn", "Transfer", "CashInRefund"],
  "signatureSecret": "secret-para-validar-assinatura",
  "active": true
}
```

**O que acontece:**
1. Turbofy cria webhook na Transfeera via API
2. Transfeera retorna `webhookId` e `signatureSecret`
3. Turbofy salva no banco (`TransfeeraWebhookConfig`)

### 2. Cliente Paga PIX

Quando um cliente paga um PIX gerado pelo Turbofy:

1. Cliente escaneia QR Code e paga
2. Transfeera processa o pagamento
3. **Transfeera envia webhook para Turbofy** (`POST /webhooks/transfeera`)

### 3. Turbofy Recebe Webhook da Transfeera

**Endpoint:** `POST /webhooks/transfeera` (público, sem autenticação Turbofy)

**Payload da Transfeera:**
```json
{
  "id": "evt_abc123",
  "version": "v1",
  "account_id": "acc_xyz789",
  "object": "CashIn",
  "date": "2025-01-22T10:00:00.000Z",
  "data": {
    "id": "cashin_123",
    "txid": "E123456789",
    "value": 100.00,
    "end2end_id": "E123456789",
    "integration_id": "order:123",
    "pix_key": "key_abc",
    "payer": { ... }
  }
}
```

**O que o Turbofy faz:**
1. Valida assinatura HMAC (`Transfeera-Signature` header)
2. Busca charge pelo `txid` ou `integration_id`
3. Atualiza charge para `PAID`
4. Cria `PaymentInteraction` (auditoria)
5. Publica evento `charge.paid` no RabbitMQ

### 4. Turbofy Notifica Integrador

O `ChargePaidConsumer` processa o evento `charge.paid`:

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

## Configuração Automática

### Script de Setup Automático

Execute para configurar webhook automaticamente:

```bash
npx ts-node scripts/setup-transfeera-webhook.ts
```

Este script:
1. Verifica se já existe webhook configurado
2. Se não existir, cria na Transfeera
3. Salva configuração no banco
4. Testa o webhook

### Setup Manual

1. **Obter URL do Turbofy:**
   ```
   https://api.turbofypay.com/webhooks/transfeera
   ```

2. **Criar webhook via API:**
   ```bash
   curl -X POST https://api.turbofypay.com/rifeiro/webhooks \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "url": "https://api.turbofypay.com/webhooks/transfeera",
       "objectTypes": ["CashIn", "Transfer", "CashInRefund"]
     }'
   ```

3. **Verificar se foi criado:**
   ```bash
   curl -X GET https://api.turbofypay.com/rifeiro/webhooks \
     -H "Authorization: Bearer YOUR_TOKEN"
   ```

## Verificação de Eventos

### Consultar Eventos na Transfeera

Use o endpoint da Transfeera para verificar se eventos foram enviados:

```bash
curl -X GET "https://api.transfeera.com/webhook/event?initialDate=2025-01-22T00:00:00Z&endDate=2025-01-22T23:59:59Z&page=1&objectType=CashIn" \
  -H "User-Agent: Turbofy/1.0 (contato@turbofy.com)" \
  -H "Authorization: Bearer TRANSFEERA_TOKEN"
```

### Verificar no Turbofy

1. **Verificar webhook attempts:**
   ```bash
   curl -X GET https://api.turbofypay.com/webhooks/transfeera/status
   ```

2. **Verificar charges:**
   ```sql
   SELECT id, status, paid_at, pix_txid 
   FROM charges 
   WHERE status = 'PAID' 
   ORDER BY paid_at DESC 
   LIMIT 10;
   ```

3. **Verificar webhooks enviados para integradores:**
   ```sql
   SELECT * 
   FROM "WebhookDelivery" 
   WHERE event_type = 'charge.paid' 
   ORDER BY created_at DESC 
   LIMIT 10;
   ```

## Troubleshooting

### Webhook não está sendo recebido

1. **Verificar se webhook está configurado na Transfeera:**
   ```bash
   npx ts-node scripts/verify-transfeera-webhooks.ts
   ```

2. **Verificar logs do Turbofy:**
   ```bash
   grep "Webhook Transfeera received" /var/log/turbofy/api.log
   ```

3. **Verificar se URL está acessível:**
   ```bash
   curl -I https://api.turbofypay.com/webhooks/transfeera/health
   ```

### Charge não está sendo atualizada

1. **Verificar matching de charge:**
   - O `txid` do webhook deve corresponder ao `pixTxid` da charge
   - Ou o `integration_id` deve corresponder ao `externalRef`

2. **Verificar logs de processamento:**
   ```bash
   grep "Charge marked as paid" /var/log/turbofy/api.log
   ```

### Integrador não recebe webhook

1. **Verificar se integrador configurou webhook:**
   ```sql
   SELECT * FROM "Webhook" WHERE merchant_id = '<merchant-id>' AND active = true;
   ```

2. **Verificar tentativas de delivery:**
   ```sql
   SELECT * FROM "WebhookDelivery" 
   WHERE merchant_id = '<merchant-id>' 
   ORDER BY created_at DESC 
   LIMIT 10;
   ```

3. **Verificar erros:**
   ```sql
   SELECT * FROM "WebhookDelivery" 
   WHERE merchant_id = '<merchant-id>' 
   AND status = 'FAILED' 
   ORDER BY created_at DESC;
   ```

## Resumo do Fluxo

```
1. Merchant cria webhook na Transfeera → Turbofy
   POST /rifeiro/webhooks
   ↓
2. Cliente paga PIX
   ↓
3. Transfeera envia webhook → Turbofy
   POST /webhooks/transfeera
   ↓
4. Turbofy processa e atualiza charge
   ↓
5. Turbofy envia webhook → Integrador
   (via WebhookDeliveryConsumer)
```

---

**Importante**: O webhook na Transfeera deve ser criado **uma vez por merchant** e apontar para a URL do Turbofy. O Turbofy então repassa os eventos para os integradores configurados.
