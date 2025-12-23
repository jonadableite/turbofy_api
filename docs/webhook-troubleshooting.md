# Troubleshooting: Webhook Transfeera não Processando Pagamentos

## 🔍 Diagnóstico Rápido

### 1. Verificar se o webhook está sendo recebido

Execute o script de verificação:
```bash
# Verificar tentativas recentes
pnpm tsx scripts/check-webhook-attempts.ts

# Verificar tentativas de uma charge específica
pnpm tsx scripts/check-webhook-attempts.ts CHARGE_ID
```

### 2. Verificar logs do servidor

Procure por estas mensagens nos logs:

**✅ Webhook recebido com sucesso:**
```
"Webhook Transfeera received (before validation)"
"Received Transfeera webhook event"
"Processing CashIn event"
"Charge found by txid" (ou "Charge found by externalRef" ou "Charge found by merchantId + amountCents fallback")
"Charge marked as paid via CashIn webhook"
```

**❌ Webhook rejeitado:**
```
"Webhook rejected: missing raw body or signature header"
"Webhook rejected: webhook not configured for account"
"Webhook rejected: invalid signature"
```

**⚠️ Charge não encontrada:**
```
"Charge not found for CashIn event - payment received but charge not linked"
```

## 🐛 Problemas Comuns e Soluções

### Problema 1: Nenhum log de webhook recebido

**Sintoma**: Não há logs de "Webhook Transfeera received" nos logs do servidor.

**Possíveis causas**:
1. Webhook não está configurado na Transfeera
2. URL do webhook está incorreta
3. Firewall bloqueando requisições da Transfeera

**Solução**:
1. Verificar configuração de webhook na Transfeera:
   - URL deve ser: `https://api.turbofypay.com/webhooks/transfeera`
   - Eventos: `CashIn`, `Payin`, `ChargeReceivable`
   - Secret deve estar configurado

2. Verificar se a URL está acessível:
   ```bash
   curl -X POST https://api.turbofypay.com/webhooks/transfeera \
     -H "Content-Type: application/json" \
     -d '{"test": true}'
   ```

3. Verificar logs de acesso do servidor/proxy (NGINX, Cloudflare, etc.)

### Problema 2: Webhook rejeitado - "missing raw body or signature header"

**Sintoma**: Log mostra "Webhook rejected: missing raw body or signature header"

**Causa**: O middleware `express.raw()` não está capturando o body corretamente, ou o header de assinatura não está sendo enviado.

**Solução**:
1. Verificar se o middleware está configurado corretamente em `src/index.ts`
2. Verificar se a Transfeera está enviando o header `X-Transfeera-Signature`
3. Verificar se o proxy (NGINX/Cloudflare) não está removendo headers

### Problema 3: Webhook rejeitado - "webhook not configured for account"

**Sintoma**: Log mostra "Webhook rejected: webhook not configured for account"

**Causa**: Não há configuração de webhook no banco para o `account_id` recebido.

**Solução**:
1. Verificar se o webhook foi configurado via `/rifeiro/webhooks` ou painel admin
2. Verificar se o `account_id` do webhook corresponde ao `account_id` da Transfeera
3. Verificar tabela `TransfeeraWebhookConfig` no banco:
   ```sql
   SELECT * FROM "TransfeeraWebhookConfig" 
   WHERE "accountId" = 'ACCOUNT_ID_RECEBIDO';
   ```

### Problema 4: Webhook rejeitado - "invalid signature"

**Sintoma**: Log mostra "Webhook rejected: invalid signature"

**Causa**: A assinatura HMAC não está batendo.

**Solução**:
1. Verificar se o secret está correto no banco
2. Verificar se o formato da assinatura está correto (`t=timestamp,v1=signature`)
3. Verificar se o `rawBody` está sendo capturado corretamente (não pode ser parseado antes)

### Problema 5: Charge não encontrada

**Sintoma**: Log mostra "Charge not found for CashIn event"

**Causa**: A charge não está sendo encontrada por nenhuma das estratégias de matching.

**Solução**:
1. Verificar se o `txid` foi salvo na charge:
   ```sql
   SELECT id, "pixTxid", "externalRef", status 
   FROM charge 
   WHERE id = 'CHARGE_ID';
   ```

2. Se `pixTxid` estiver null, a charge foi criada antes da correção. O fallback por `merchantId + valor` deve funcionar.

3. Verificar se o `integration_id` do webhook corresponde ao `externalRef` ou `merchantId` da charge.

4. Usar script de diagnóstico:
   ```bash
   pnpm tsx scripts/diagnose-webhook-issue.ts CHARGE_ID TXID INTEGRATION_ID
   ```

### Problema 6: Charge encontrada mas não atualizada

**Sintoma**: Log mostra "Charge found by txid" mas status não muda para PAID.

**Causa**: Erro no processamento após encontrar a charge.

**Solução**:
1. Verificar logs de erro após "Charge found"
2. Verificar se há erros no RabbitMQ (publicação do evento `charge.paid`)
3. Verificar se o `ChargePaidConsumer` está rodando
4. Verificar tabela `WebhookAttempt` para ver status de processamento

## 📊 Verificações no Banco de Dados

### Verificar tentativas de webhook

```sql
-- Últimas 20 tentativas
SELECT 
  id,
  provider,
  type,
  "eventId",
  status,
  attempt,
  "signatureValid",
  "errorMessage",
  "createdAt"
FROM "WebhookAttempt"
WHERE provider = 'transfeera'
ORDER BY "createdAt" DESC
LIMIT 20;
```

### Verificar charges pendentes

```sql
-- Charges PIX pendentes criadas nas últimas 24h
SELECT 
  id,
  "merchantId",
  "pixTxid",
  "externalRef",
  status,
  "amountCents",
  "createdAt"
FROM charge
WHERE status = 'PENDING'
  AND method = 'PIX'
  AND "createdAt" > NOW() - INTERVAL '24 hours'
ORDER BY "createdAt" DESC;
```

### Verificar configuração de webhook

```sql
-- Configurações de webhook da Transfeera
SELECT 
  id,
  "webhookId",
  "accountId",
  url,
  "objectTypes",
  "createdAt"
FROM "TransfeeraWebhookConfig"
ORDER BY "createdAt" DESC;
```

## 🔧 Scripts de Diagnóstico

### 1. Verificar tentativas de webhook

```bash
pnpm tsx scripts/check-webhook-attempts.ts [chargeId]
```

### 2. Diagnóstico completo

```bash
pnpm tsx scripts/diagnose-webhook-issue.ts [chargeId] [txid] [integrationId]
```

## 🚀 Próximos Passos Após Identificar o Problema

1. **Se webhook não está chegando**: Verificar configuração na Transfeera
2. **Se webhook está sendo rejeitado**: Verificar logs específicos e corrigir validação
3. **Se charge não é encontrada**: Verificar dados da charge e ajustar matching
4. **Se charge é encontrada mas não atualizada**: Verificar processamento assíncrono (RabbitMQ)

## 📝 Checklist de Verificação

- [ ] Webhook configurado na Transfeera com URL correta
- [ ] Secret configurado e correto
- [ ] Eventos corretos selecionados (CashIn, Payin, ChargeReceivable)
- [ ] URL acessível publicamente (sem firewall bloqueando)
- [ ] Middleware `express.raw()` configurado para `/webhooks/transfeera`
- [ ] Charge criada com `txid` salvo (ou fallback funcionando)
- [ ] `ChargePaidConsumer` rodando
- [ ] `WebhookDispatcherConsumer` rodando
- [ ] Logs mostrando recebimento de webhook
