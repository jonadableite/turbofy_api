# Correção: Problema de Webhook Transfeera - Pagamentos não Processados

## 🆕 Atualização v2 (Janeiro 2025)

### Problemas Adicionais Identificados e Corrigidos

1. **Header de assinatura incorreto**: O código buscava `x-transfeera-signature` mas a Transfeera envia `Transfeera-Signature` (sem prefixo `x-`). Express.js converte para lowercase: `transfeera-signature`.

2. **Filas RabbitMQ não configuradas**: As filas de webhook (`turbofy.webhooks.dispatch` e `turbofy.webhooks.delivery`) não estavam sendo criadas no `RabbitMQMessagingAdapter`.

3. **Consumers com bindings incorretos**: Os consumers `WebhookDispatcherConsumer` e `WebhookDeliveryConsumer` eram inicializados sem bindings específicos.

### Arquivos Corrigidos (v2)

- `turbofy_api/src/infrastructure/http/routes/transfeeraWebhookRoutes.ts`
  - Corrigido header de assinatura para buscar `transfeera-signature`
  - Adicionados endpoints `/health` e `/status` para diagnóstico
  - Melhorados logs de diagnóstico
  
- `turbofy_api/src/infrastructure/adapters/messaging/RabbitMQMessagingAdapter.ts`
  - Adicionado exchange `turbofy.webhooks`
  - Configuradas filas `turbofy.webhooks.dispatch` e `turbofy.webhooks.delivery`
  - Adicionados bindings para eventos que disparam webhooks
  
- `turbofy_api/src/infrastructure/consumers/WebhookDispatcherConsumer.ts`
  - Configurado binding correto para `turbofy.webhooks.dispatch`
  
- `turbofy_api/src/infrastructure/consumers/WebhookDeliveryConsumer.ts`
  - Configurado binding correto para `turbofy.webhooks.delivery`

### Novos Endpoints de Diagnóstico

- `GET /webhooks/transfeera/health` - Verifica se o endpoint está acessível
- `GET /webhooks/transfeera/status` - Mostra configurações e tentativas recentes

### Novos Scripts de Diagnóstico

- `npx ts-node scripts/verify-transfeera-webhooks.ts` - Verifica configuração completa
- `npx ts-node scripts/test-with-webhook-site.ts <url>` - Configura webhook com webhook.site
- `npx ts-node scripts/simulate-webhook-to-site.ts <url> [charge-id]` - Simula webhook para webhook.site
- `npx ts-node scripts/test-webhook-flow.ts` - Teste end-to-end completo

---

## 🔍 Problema Identificado (Original)

Um pagamento PIX foi realizado, mas o webhook da Transfeera não processou corretamente o evento, resultando em:
- Status da charge não atualizado para `PAID`
- Webhook não enviado para o integrador
- Pagamento não reconhecido na plataforma Turbofy

## 🐛 Causa Raiz

Foram identificados **dois problemas críticos**:

### 1. TXID não estava sendo salvo na charge

**Problema**: Quando uma charge PIX era criada, o `txid` gerado pela Transfeera não era retornado nem salvo na charge.

**Fluxo problemático**:
1. `CreateCharge` chama `paymentProvider.issuePixCharge()`
2. `TransfeeraPaymentProviderAdapter` gera `txid` e envia para Transfeera
3. Transfeera retorna `txid` na resposta, mas o adapter não retornava
4. `CreateCharge` não recebia `txid` e não salvava na charge
5. Quando webhook chegava com `txid`, não conseguia encontrar a charge

**Arquivos afetados**:
- `PaymentProviderPort.ts` - Interface não incluía `txid` no output
- `Charge.ts` - Método `withPixData()` não aceitava `txid`
- `TransfeeraPaymentProviderAdapter.ts` - Não retornava `txid` da resposta
- `CreateCharge.ts` - Não passava `txid` para `withPixData()`

### 2. Lógica de matching no webhook era insuficiente

**Problema**: A lógica de busca da charge no webhook tinha falhas:

1. **Ordem incorreta**: Tentava por `externalRef` primeiro, depois `txid`
   - Mas `txid` é mais confiável e único por cobrança
   
2. **Mismatch de integration_id**: 
   - Transfeera envia `integration_id = merchantId` quando o integrador não passa `externalRef`
   - Código tentava buscar por `findByExternalRef(merchantId)`, que falhava se `externalRef` fosse diferente

3. **Sem fallback**: Não havia estratégia de fallback quando `txid` e `externalRef` não funcionavam

## ✅ Correções Implementadas

### 1. Salvar TXID na charge

**Mudanças**:
- ✅ Adicionado `txid?: string` ao `PixIssueOutput` interface
- ✅ Modificado `withPixData()` para aceitar `txid` como parâmetro
- ✅ `TransfeeraPaymentProviderAdapter` agora retorna `txid` da resposta
- ✅ `CreateCharge` passa `txid` para `withPixData()` e salva na charge
- ✅ Atualizados `StubPaymentProviderAdapter` e `BspayPaymentProviderAdapter` para retornar `txid`

**Arquivos modificados**:
- `src/ports/PaymentProviderPort.ts`
- `src/domain/entities/Charge.ts`
- `src/infrastructure/adapters/payment/TransfeeraPaymentProviderAdapter.ts`
- `src/infrastructure/adapters/payment/StubPaymentProviderAdapter.ts`
- `src/infrastructure/adapters/payment/BspayClient.ts`
- `src/infrastructure/adapters/payment/BspayPaymentProviderAdapter.ts`
- `src/application/useCases/CreateCharge.ts`

### 2. Melhorar lógica de matching no webhook

**Nova estratégia de matching** (em ordem de prioridade):

1. **Por TXID** (mais confiável)
   - Busca direta por `findByTxid(data.txid)`
   - TXID é único por cobrança e sempre presente no webhook

2. **Por ExternalRef** (se integrador passou)
   - Busca por `findByExternalRef(data.integration_id)`
   - Funciona quando integrador passa `externalRef` no POST `/rifeiro/pix`

3. **Fallback por MerchantId + Valor** (último recurso)
   - Busca charges recentes (últimos 7 dias) do `merchantId`
   - Filtra por valor exato (`amountCents`)
   - Se encontrar exatamente 1 charge, usa ela
   - Se encontrar múltiplas, loga warning e não faz auto-match

**Arquivo modificado**:
- `src/infrastructure/http/routes/transfeeraWebhookRoutes.ts` - Função `handleCashInEvent()`

### 3. Script de diagnóstico

Criado script para investigar problemas de webhook:
- `scripts/diagnose-webhook-issue.ts`
- Permite diagnosticar charges não encontradas
- Analisa tentativas de webhook
- Identifica problemas de matching

## 🧪 Como Testar

### 1. Testar criação de charge com TXID

```bash
# Criar charge via API
curl -X POST https://api.turbofy.com/rifeiro/pix \
  -H "x-client-id: YOUR_CLIENT_ID" \
  -H "x-client-secret: YOUR_CLIENT_SECRET" \
  -d '{
    "amountCents": 10000,
    "description": "Teste",
    "externalRef": "order:123"
  }'

# Verificar se charge foi criada com txid
# Consultar banco: SELECT id, "pixTxid", "externalRef" FROM charge WHERE id = 'CHARGE_ID';
```

### 2. Testar webhook manualmente

```bash
# Simular webhook da Transfeera
curl -X POST http://localhost:3000/webhooks/transfeera \
  -H "Content-Type: application/json" \
  -H "X-Transfeera-Signature: t=1234567890,v1=VALID_SIGNATURE" \
  -d '{
    "id": "webhook-123",
    "version": "1.0",
    "account_id": "ACCOUNT_ID",
    "object": "CashIn",
    "date": "2025-01-15T10:00:00Z",
    "data": {
      "id": "cashin-123",
      "value": 100.00,
      "end2end_id": "E12345678901234567890123456789012",
      "txid": "TXID_DA_CHARGE",
      "integration_id": "order:123",
      "pix_key": "chave@exemplo.com"
    }
  }'
```

### 3. Usar script de diagnóstico

```bash
# Diagnóstico com chargeId
pnpm tsx scripts/diagnose-webhook-issue.ts CHARGE_ID

# Diagnóstico com txid
pnpm tsx scripts/diagnose-webhook-issue.ts "" TXID

# Diagnóstico com integration_id
pnpm tsx scripts/diagnose-webhook-issue.ts "" "" "order:123"
```

## 📊 Monitoramento

Após o deploy, monitorar:

1. **Logs de webhook**:
   - Buscar por "Charge found by txid"
   - Buscar por "Charge found by externalRef"
   - Buscar por "Charge found by merchantId + amountCents fallback"
   - Buscar por "Charge not found for CashIn event"

2. **Tabela WebhookAttempt**:
   ```sql
   SELECT * FROM "WebhookAttempt" 
   WHERE provider = 'transfeera' 
   AND status = 'failed' 
   ORDER BY "createdAt" DESC 
   LIMIT 20;
   ```

3. **Charges não processadas**:
   ```sql
   SELECT c.id, c.status, c."pixTxid", c."externalRef", c."createdAt"
   FROM charge c
   WHERE c.status = 'PENDING'
   AND c.method = 'PIX'
   AND c."createdAt" > NOW() - INTERVAL '24 hours'
   ORDER BY c."createdAt" DESC;
   ```

## 🔄 Próximos Passos

1. **Deploy das correções** em staging primeiro
2. **Testar fluxo completo** com charge real
3. **Monitorar logs** por 24-48h após deploy
4. **Verificar se charges antigas** podem ser reprocessadas (se necessário)

## ⚠️ Notas Importantes

- **Charges antigas**: Charges criadas antes desta correção não terão `txid` salvo. O fallback por `merchantId + valor` deve funcionar para essas.
- **Compatibilidade**: As mudanças são retrocompatíveis - `txid` é opcional na interface.
- **Performance**: O fallback por `merchantId + valor` faz uma query adicional, mas só é executado quando necessário.

## 📝 Referências

- Issue relacionada: Webhook Transfeera não processando pagamentos
- Arquivos modificados: Ver lista acima
- Script de diagnóstico: `scripts/diagnose-webhook-issue.ts`
