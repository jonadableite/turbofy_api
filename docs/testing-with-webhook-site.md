# Testando Webhooks com Webhook.site

## Visão Geral

O [Webhook.site](https://webhook.site) é uma ferramenta gratuita que permite receber e inspecionar webhooks sem precisar configurar um servidor próprio. É perfeito para testes e desenvolvimento.

## Passo a Passo

### 1. Obter URL do Webhook.site

1. Acesse: https://webhook.site
2. Você receberá uma URL única, por exemplo:
   ```
   https://webhook.site/36dda071-6d29-4488-9f77-b3e83f3a25e3
   ```
3. **Mantenha esta página aberta** - ela mostrará todas as requisições recebidas

### 2. Configurar Webhook na Transfeera

Execute o script de configuração:

```bash
cd turbofy_api
npx ts-node scripts/test-with-webhook-site.ts https://webhook.site/36dda071-6d29-4488-9f77-b3e83f3a25e3
```

O script irá:
- ✅ Verificar se há merchant configurado
- ✅ Criar webhook na Transfeera apontando para o webhook.site
- ✅ Salvar configuração no banco Turbofy
- ✅ Criar uma charge PIX de teste

### 3. Testar o Fluxo Completo

#### Opção A: Teste Real (Produção)

1. **Criar cobrança PIX**:
   ```bash
   curl -X POST https://api.turbofypay.com/rifeiro/pix \
     -H "x-client-id: YOUR_CLIENT_ID" \
     -H "x-client-secret: YOUR_CLIENT_SECRET" \
     -H "Content-Type: application/json" \
     -d '{
       "amountCents": 10000,
       "description": "Teste Webhook.site"
     }'
   ```

2. **Pagar o PIX** usando o QR Code retornado

3. **Verificar no webhook.site**:
   - Acesse a URL do webhook.site
   - Você verá uma requisição POST com:
     - Header `Transfeera-Signature`
     - Payload JSON com evento `CashIn`
     - Status 200 na resposta

#### Opção B: Teste Simulado (Desenvolvimento)

Execute o script de teste end-to-end:

```bash
npx ts-node scripts/test-webhook-flow.ts
```

Este script simula o webhook da Transfeera e você pode verificar no webhook.site se foi recebido.

### 4. Verificar Resultados

No webhook.site, você verá:

**Headers:**
```
Transfeera-Signature: t=1703180400000,v1=5d7e8f9a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c
Content-Type: application/json
User-Agent: Transfeera/1.0
```

**Body (JSON):**
```json
{
  "id": "evt_abc123",
  "version": "v1",
  "account_id": "acc_xyz789",
  "object": "CashIn",
  "date": "2025-01-15T10:00:00.000Z",
  "data": {
    "id": "cashin_123",
    "txid": "E123456789",
    "value": 100.00,
    "end2end_id": "E123456789",
    "integration_id": "order:123",
    "pix_key": "key_abc",
    "payer": {
      "name": "Fulano da Silva",
      "document": "123.456.789-00"
    }
  }
}
```

### 5. Verificar no Turbofy

Após receber o webhook, verifique se:

1. **Charge foi atualizada**:
   ```sql
   SELECT id, status, paid_at FROM charges WHERE id = '<charge_id>';
   -- Deve mostrar status = 'PAID'
   ```

2. **PaymentInteraction foi criado**:
   ```sql
   SELECT * FROM "PaymentInteraction" WHERE charge_id = '<charge_id>' AND type = 'CHARGE_PAID';
   ```

3. **Webhook para integradores foi enviado** (se configurado):
   ```sql
   SELECT * FROM "WebhookDelivery" WHERE event_type = 'charge.paid' ORDER BY created_at DESC LIMIT 5;
   ```

## Troubleshooting

### Webhook não aparece no webhook.site

1. **Verificar se webhook está configurado na Transfeera**:
   ```bash
   npx ts-node scripts/verify-transfeera-webhooks.ts
   ```

2. **Verificar logs do Turbofy**:
   ```bash
   # Procurar por logs de webhook recebido
   grep "Webhook Transfeera received" /var/log/turbofy/api.log
   ```

3. **Verificar se a URL está acessível**:
   ```bash
   curl -I https://webhook.site/36dda071-6d29-4488-9f77-b3e83f3a25e3
   ```

### Webhook aparece mas com erro 401

Isso significa que a assinatura está inválida. Verifique:

1. **Secret correto**: O secret salvo no banco deve ser o mesmo retornado pela Transfeera
2. **Header correto**: Deve ser `Transfeera-Signature` (não `x-transfeera-signature`)
3. **Payload raw**: O payload deve ser usado como string raw, sem reformatação

### Webhook aparece mas charge não foi atualizada

1. **Verificar matching de charge**:
   - O `txid` do webhook deve corresponder ao `pixTxid` da charge
   - Ou o `integration_id` deve corresponder ao `externalRef`

2. **Verificar logs de processamento**:
   ```bash
   grep "Charge marked as paid" /var/log/turbofy/api.log
   ```

## Limitações do Webhook.site

- ⚠️ URLs expiram após 48 horas de inatividade
- ⚠️ Não é adequado para produção (apenas testes)
- ⚠️ Não suporta validação de assinatura automática (você precisa verificar manualmente)

## Próximos Passos

Após validar com webhook.site:

1. **Configurar webhook de produção**:
   - Use uma URL HTTPS do seu servidor
   - Configure via API `/rifeiro/webhooks` ou painel admin
   - Salve o secret com segurança

2. **Implementar validação de assinatura**:
   - Use o secret retornado na criação do webhook
   - Valide o header `Transfeera-Signature`
   - Verifique timestamp (anti-replay)

3. **Monitorar webhooks**:
   - Use o endpoint `/webhooks/transfeera/status` para ver tentativas
   - Configure alertas para falhas persistentes

---

**Dica**: Mantenha o webhook.site aberto em uma aba separada durante os testes para ver as requisições em tempo real!
