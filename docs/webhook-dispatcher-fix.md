# Correção: WebhookDispatcherConsumer - Extração de Payload

## Problema Identificado

O `WebhookDispatcherConsumer` estava rejeitando eventos válidos como "inválidos" porque não extraía o `payload` corretamente do envelope do RabbitMQ.

### Log do Erro

```
{"level":"warn","msg":"Evento de webhook inválido (faltando campos obrigatórios)","type":"[WEBHOOK_DISPATCHER_INVALID_EVENT]","payload":{"event":{"id":"evt_...","type":"webhook.dispatch","payload":{...}}}}
```

## Causa Raiz

O evento publicado no RabbitMQ tem a estrutura:

```json
{
  "id": "evt_...",
  "type": "webhook.dispatch",
  "timestamp": "...",
  "version": "v1",
  "routingKey": "turbofy.webhooks.charge.paid",
  "payload": {
    "id": "evt_...",
    "type": "charge.paid",
    "merchantId": "...",
    "data": { ... }
  }
}
```

O consumer estava tentando acessar `event.id`, `event.type`, `event.merchantId` diretamente, mas esses campos estão dentro de `event.payload`.

## Solução

### Antes (INCORRETO)

```typescript
const envelope = event as WebhookEventEnvelope;
if (!envelope.id || !envelope.type || !envelope.merchantId) {
  // Sempre falhava porque id, type, merchantId estão em event.payload
}
```

### Depois (CORRETO)

```typescript
const rawEvent = event as {
  id?: string;
  type?: string;
  payload?: WebhookEventEnvelope;
};

// Extrair o WebhookEventEnvelope do payload
const envelope = rawEvent.payload as WebhookEventEnvelope;

if (!envelope || !envelope.id || !envelope.type || !envelope.merchantId) {
  // Agora valida corretamente os campos do payload
}
```

## Fluxo Correto

1. **Transfeera** → envia `CashIn` para `/webhooks/transfeera`
2. **transfeeraWebhookRoutes** → processa evento, marca charge como PAID
3. **DispatchWebhooks.execute()** → publica evento `webhook.dispatch` no RabbitMQ com `payload: WebhookEventEnvelope`
4. **WebhookDispatcherConsumer** → consome evento, **extrai payload**, busca webhooks do merchant
5. **WebhookDeliveryConsumer** → envia evento para URL do integrador

## Arquivos Modificados

- `turbofy_api/src/infrastructure/consumers/WebhookDispatcherConsumer.ts`

## Problema Adicional: Usuário não Configurou Webhook

Se o log mostrar:

```
"WEBHOOK_DISPATCHER_NO_WEBHOOKS": "Nenhum webhook ativo encontrado para este evento"
```

Isso significa que o **integrador não configurou um webhook** para receber eventos. O integrador precisa:

1. Criar webhook: `POST /integrations/webhooks`
2. Informar URL de destino e eventos (ex: `["charge.paid"]`)
3. Implementar endpoint que recebe e processa os eventos

Ver: `docs/CONFIGURE_WEBHOOK.md` e `docs/integration-guide.md`

---

**Data**: 2025-12-22
**Status**: ✅ Corrigido
