# Configuração de Webhooks Transfeera - Guia Completo

## Visão Geral

Este documento descreve como configurar e diagnosticar webhooks da Transfeera para receber notificações de pagamentos PIX em tempo real.

## Fluxo de Webhooks

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Transfeera    │───>│  Turbofy API    │───>│  RabbitMQ       │
│   (PIX pago)    │    │  /webhooks/     │    │  (charge.paid)  │
│                 │    │  transfeera     │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                              │
                              ▼
                       ┌─────────────────┐
                       │ ChargePaidCons. │
                       │ DispatchWebhook │
                       └─────────────────┘
                              │
                              ▼
                       ┌─────────────────┐
                       │ Webhook do      │
                       │ Integrador      │
                       │ (charge.paid)   │
                       └─────────────────┘
```

## 1. Configuração na Transfeera

### Criar Webhook via API

```bash
curl -X POST https://api.transfeera.com/webhook \
  -H "Authorization: Bearer <SEU_TOKEN>" \
  -H "Content-Type: application/json" \
  -H "User-Agent: Turbofy/1.0 contato@turbofy.com" \
  -d '{
    "url": "https://api.turbofypay.com/webhooks/transfeera",
    "object_types": ["CashIn", "Transfer", "CashInRefund"]
  }'
```

### Resposta Esperada

```json
{
  "id": "5211e1a1-77a6-4662-80e0-8b9b98068ace",
  "signature_secret": "5d55729305b197168018fcff2a18e99f78ab8dd4efd03b6e895cf08bf104bca204944e45"
}
```

**IMPORTANTE**: Salve o `signature_secret` - ele é necessário para validar a assinatura dos webhooks!

### Tipos de Eventos Recomendados

| Tipo | Descrição |
|------|-----------|
| `CashIn` | PIX recebido (pagamento) |
| `Transfer` | Transferência/Payout concluída |
| `CashInRefund` | Devolução de PIX |

## 2. Configuração no Turbofy

### Via API `/rifeiro/webhooks`

O Turbofy salva a configuração do webhook no banco de dados para:
1. Validar assinaturas
2. Vincular eventos ao merchant correto

```bash
POST /rifeiro/webhooks
Authorization: Bearer <TOKEN_DO_MERCHANT>

{
  "url": "https://api.turbofypay.com/webhooks/transfeera",
  "objectTypes": ["CashIn", "Transfer", "CashInRefund"]
}
```

### Variáveis de Ambiente

Certifique-se de que as seguintes variáveis estão configuradas:

```env
# Credenciais Transfeera
TRANSFEERA_CLIENT_ID=seu_client_id
TRANSFEERA_CLIENT_SECRET=seu_client_secret

# Opcional: Secret global (fallback)
TRANSFEERA_WEBHOOK_SECRET=32_caracteres_ou_mais
```

## 3. Formato do Webhook

### Header de Assinatura

A Transfeera envia o header `Transfeera-Signature` com o formato:

```
Transfeera-Signature: t=1580306324381,v1=5257a869e7ecebeda32affa62cdca3fa51cad7e77a0e56ff536d0ce8e108d8bd
```

- `t`: Timestamp em milissegundos
- `v1`: Assinatura HMAC-SHA256

### Validação da Assinatura

```javascript
const crypto = require('crypto');

const secretKey = 'seu_signature_secret';
const ts = '1580306991086'; // Valor de 't' do header
const requestPayload = '{"id":"..."}'; // Corpo da requisição (raw, não formatado)

const signed_payload = `${ts}.${requestPayload}`;

const signature = crypto
  .createHmac('sha256', secretKey)
  .update(signed_payload)
  .digest('hex');

// Comparar 'signature' com o valor de 'v1' do header
```

### Exemplo de Payload CashIn (PIX pago)

```json
{
  "id": "64f87613-ea38-453a-bbee-07b894b0f083",
  "account_id": "d95e7630-1b3c-4ac5-991d-d599d75efdd0",
  "object": "CashIn",
  "version": "v1",
  "date": "2021-09-20T09:15:00-03:00",
  "data": {
    "id": "64f87613-ea38-453a-bbee-07b894b0f083",
    "txid": "d0209d938a035a92fdaaed191f7245bc",
    "value": 10.00,
    "end2end_id": "E18236120202109201214s125asdfZA",
    "integration_id": "111111asd11111",
    "pix_key": "df54cb1f-8cbf-4578-b2b5-8f11b6233d6b",
    "payer": {
      "name": "Fulano da Silva",
      "document": "***.274.581-**",
      "bank": {
        "code": "260",
        "name": "Nu Pagamentos S.A."
      }
    }
  }
}
```

## 4. Matching de Charges

O Turbofy usa a seguinte estratégia para vincular o webhook à charge correta:

1. **Por `txid`** (mais confiável): O `txid` é salvo na charge quando o PIX é emitido
2. **Por `integration_id`** (externalRef): Se o integrador passou um identificador único
3. **Fallback por valor**: Busca charges pendentes do merchant com mesmo valor

## 5. Endpoints de Diagnóstico

### Verificar se o endpoint está acessível

```bash
GET /webhooks/transfeera/health
```

Resposta:
```json
{
  "status": "ok",
  "message": "Turbofy Transfeera Webhook Endpoint",
  "timestamp": "2025-01-15T10:00:00.000Z"
}
```

### Verificar status e configuração

```bash
GET /webhooks/transfeera/status
```

Resposta:
```json
{
  "status": "ok",
  "configs": [...],
  "recentAttempts": [...]
}
```

## 6. Troubleshooting

### Problema: Webhook não está chegando

1. **Verificar URL na Transfeera**:
   ```bash
   curl -X GET https://api.transfeera.com/webhook \
     -H "Authorization: Bearer <TOKEN>"
   ```

2. **Testar acessibilidade**:
   ```bash
   curl -I https://api.turbofypay.com/webhooks/transfeera/health
   ```

3. **Verificar logs**:
   ```bash
   # Procurar por logs de webhook recebido
   grep "Webhook Transfeera received" /var/log/turbofy/api.log
   ```

### Problema: Assinatura inválida

1. **Verificar secret**:
   - O secret salvo no banco deve ser o mesmo retornado pela Transfeera
   - Use o endpoint `/webhooks/transfeera/status` para verificar

2. **Verificar payload**:
   - O payload deve ser usado como string raw, sem reformatação
   - Qualquer espaço ou ordem diferente invalida a assinatura

### Problema: Charge não encontrada

1. **Verificar se o `txid` foi salvo**:
   ```sql
   SELECT id, pix_txid, external_ref FROM charges WHERE id = '<charge_id>';
   ```

2. **Verificar matching por valor**:
   - Múltiplas charges com mesmo valor impedem o matching automático
   - Use `externalRef` único para cada cobrança

## 7. Scripts de Diagnóstico

### Verificar configuração completa

```bash
cd turbofy_api
npx ts-node scripts/verify-transfeera-webhooks.ts
```

### Verificar tentativas de webhook

```bash
cd turbofy_api
npx ts-node scripts/check-webhook-attempts.ts
```

## 8. Eventos do Turbofy para Integradores

Após processar o webhook da Transfeera, o Turbofy dispara webhooks para os integradores:

| Evento | Descrição |
|--------|-----------|
| `charge.paid` | Cobrança paga |
| `charge.expired` | Cobrança expirada |
| `charge.created` | Cobrança criada |

### Formato do Webhook Turbofy

```json
{
  "id": "evt_abc123",
  "type": "charge.paid",
  "timestamp": "2025-01-15T10:00:00.000Z",
  "merchantId": "merchant_123",
  "data": {
    "chargeId": "charge_123",
    "status": "PAID",
    "amountCents": 10000,
    "method": "PIX",
    "paidAt": "2025-01-15T10:00:00.000Z"
  }
}
```

### Header de Assinatura Turbofy

```
turbofy-signature: t=1234567890,v1=<hmac_sha256>
```

## 9. Checklist de Configuração

- [ ] Webhook criado na Transfeera com URL correta
- [ ] Secret salvo no banco Turbofy
- [ ] URL acessível externamente (HTTPS)
- [ ] Firewall permite requisições da Transfeera
- [ ] Consumers RabbitMQ rodando (ChargePaidConsumer, WebhookDispatcherConsumer)
- [ ] Webhooks do integrador configurados (se aplicável)

## 10. Suporte

Em caso de problemas:

1. Execute o script de diagnóstico
2. Verifique os logs do servidor
3. Consulte a documentação da Transfeera: https://docs.transfeera.dev/
4. Entre em contato com o suporte Turbofy
