# 🔧 Troubleshooting: Webhooks Não Estão Chegando

## Problema

O usuário (integrador) criou uma cobrança PIX, o cliente pagou, a Turbofy processou o pagamento corretamente, **MAS** o webhook não chegou no site do integrador.

---

## ✅ Correções Implementadas

### 1. WebhookDispatcherConsumer - Extração de Payload ✅

**Problema:** O consumer não estava extraindo o `payload` do envelope RabbitMQ.

**Solução:** Modificado para extrair `event.payload` corretamente.

```typescript
// ANTES (ERRADO)
const envelope = event as WebhookEventEnvelope;

// DEPOIS (CORRETO)
const rawEvent = event as { payload?: WebhookEventEnvelope };
const envelope = rawEvent.payload as WebhookEventEnvelope;
```

### 2. WebhookDeliveryConsumer - Extração de Payload ✅

**Problema:** O consumer também não estava extraindo o `payload` do envelope RabbitMQ.

**Solução:** Modificado para extrair `event.payload` corretamente.

```typescript
// ANTES (ERRADO)
const message = event as WebhookDeliveryMessage;

// DEPOIS (CORRETO)
const rawEvent = event as { payload?: WebhookDeliveryMessage };
const message = rawEvent.payload as WebhookDeliveryMessage;
```

### 3. Detecção de Teste vs Evento Real ✅

**Problema:** Eventos reais estavam sendo tratados como "teste" e não eram processados.

**Solução:** Lógica de detecção mais restritiva - só trata como teste se **realmente** não tiver dados válidos.

---

## 🔍 Como Diagnosticar

### Passo 1: Verificar se o webhook está cadastrado

```bash
curl -X GET "https://api.turbofypay.com/integrations/webhooks" \
  -H "x-client-id: SEU_CLIENT_ID" \
  -H "x-client-secret: SEU_CLIENT_SECRET"
```

Se retornar lista vazia, o integrador **precisa criar um webhook** primeiro.

### Passo 2: Verificar deliveries no banco

Execute o script de diagnóstico:

```bash
cd turbofy_api
MERCHANT_ID="de9f810a-fefe-45b5-b269-b4123f4b3a61" tsx scripts/check-webhook-deliveries.ts
```

Isso mostrará:
- Webhooks cadastrados
- Deliveries criadas (SUCCESS, FAILED, PENDING, RETRYING)
- Logs de tentativas
- Cobranças recentes

### Passo 3: Verificar logs da API

Procure por:
- `WEBHOOK_DISPATCHER_PROCESSING` - Dispatcher processou evento
- `WEBHOOK_DISPATCHER_NO_WEBHOOKS` - **Nenhum webhook encontrado** (integrador não criou)
- `WEBHOOK_DELIVERY_PROCESSING` - Delivery consumer processou
- `WEBHOOK_DELIVERY_SUCCESS` - Webhook entregue com sucesso
- `WEBHOOK_DELIVERY_FAILED` - Falha ao entregar

---

## 🎯 Fluxo Completo (Esperado)

```
1. Cliente paga PIX
   ↓
2. Transfeera → POST /webhooks/transfeera (CashIn event)
   ↓
3. transfeeraWebhookRoutes → processa, marca charge como PAID
   ↓
4. Publica evento "charge.paid" no RabbitMQ (turbofy.payments)
   ↓
5. ChargePaidConsumer → consome, publica "webhook.dispatch"
   ↓
6. WebhookDispatcherConsumer → busca webhooks do merchant, cria WebhookDelivery
   ↓
7. Publica "webhook.delivery" no RabbitMQ
   ↓
8. WebhookDeliveryConsumer → envia POST para URL do integrador
   ↓
9. Integrador recebe webhook e retorna 200 OK
```

---

## ⚠️ Causas Comuns

### 1. Integrador não criou webhook

**Sintoma:** Log mostra `WEBHOOK_DISPATCHER_NO_WEBHOOKS`

**Solução:** Integrador precisa criar webhook via:
```bash
POST /integrations/webhooks
```

Ver: `docs/CONFIGURE_WEBHOOK.md`

### 2. URL do webhook inacessível

**Sintoma:** Deliveries com status `FAILED`, logs mostram timeout ou erro de rede

**Solução:**
- Verificar se a URL está acessível publicamente
- Verificar firewall/DNS
- Testar com `curl` manualmente

### 3. Endpoint retorna erro (não 2xx)

**Sintoma:** Deliveries com `httpStatus` 4xx ou 5xx

**Solução:**
- Verificar logs do servidor do integrador
- Verificar validação de assinatura
- Verificar se endpoint está retornando 200

### 4. Payload não está sendo extraído (CORRIGIDO)

**Sintoma:** Logs mostram `WEBHOOK_DISPATCHER_INVALID_EVENT` ou `WEBHOOK_DELIVERY_INVALID_MESSAGE`

**Solução:** ✅ Corrigido - consumers agora extraem `event.payload` corretamente

---

## 📋 Checklist para o Integrador

- [ ] Webhook criado via `POST /integrations/webhooks`
- [ ] Secret guardado em variável de ambiente
- [ ] Endpoint implementado no servidor
- [ ] Endpoint usa `express.raw()` para receber body como Buffer
- [ ] Validação de assinatura implementada corretamente
- [ ] Endpoint retorna HTTP 200 OK
- [ ] URL acessível publicamente (HTTPS)
- [ ] Firewall permite requisições da Turbofy

---

## 🧪 Testar Manualmente

### 1. Enviar evento de teste

```bash
curl -X POST "https://api.turbofypay.com/integrations/webhooks/wh_abc123/test" \
  -H "x-client-id: SEU_CLIENT_ID" \
  -H "x-client-secret: SEU_CLIENT_SECRET"
```

### 2. Verificar logs do servidor do integrador

O integrador deve ver:
- Requisição POST recebida
- Header `turbofy-signature` presente
- Assinatura validada com sucesso
- Evento processado
- Resposta 200 retornada

---

## 📞 Próximos Passos

1. **Deploy** das correções (WebhookDispatcherConsumer e WebhookDeliveryConsumer)
2. **Verificar** se o integrador tem webhooks cadastrados
3. **Executar** script de diagnóstico: `check-webhook-deliveries.ts`
4. **Testar** com evento de teste: `POST /integrations/webhooks/:id/test`
5. **Criar** nova cobrança PIX e pagar para testar fluxo completo

---

**Data**: 2025-12-22
**Status**: ✅ Correções implementadas, aguardando deploy e testes
