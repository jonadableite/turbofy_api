# 🚀 Teste Rápido de Webhook com Webhook.site

## Passo a Passo Simplificado

### 1. Obter URL do Webhook.site

1. Acesse: **https://webhook.site**
2. Copie a URL única que aparece (ex: `https://webhook.site/36dda071-6d29-4488-9f77-b3e83f3a25e3`)
3. **Mantenha a página aberta** - ela mostrará todas as requisições recebidas

### 2. Configurar Webhook

Execute:

```bash
cd turbofy_api
npx ts-node scripts/test-with-webhook-site.ts https://webhook.site/36dda071-6d29-4488-9f77-b3e83f3a25e3
```

Isso irá:
- ✅ Configurar webhook na Transfeera
- ✅ Criar charge PIX de teste
- ✅ Salvar configuração no banco

### 3. Simular Webhook (Teste Rápido)

Para testar imediatamente sem precisar pagar um PIX real:

```bash
npx ts-node scripts/simulate-webhook-to-site.ts https://webhook.site/36dda071-6d29-4488-9f77-b3e83f3a25e3
```

Isso enviará um webhook simulado diretamente para o webhook.site.

### 4. Verificar Resultados

No webhook.site você verá:
- ✅ Header `Transfeera-Signature`
- ✅ Payload JSON com evento `CashIn`
- ✅ Status 200

### 5. Teste Real (Opcional)

Para testar com PIX real:

1. Crie uma cobrança:
   ```bash
   curl -X POST https://api.turbofypay.com/rifeiro/pix \
     -H "x-client-id: YOUR_CLIENT_ID" \
     -H "x-client-secret: YOUR_CLIENT_SECRET" \
     -H "Content-Type: application/json" \
     -d '{"amountCents": 10000, "description": "Teste"}'
   ```

2. Pague o PIX usando o QR Code

3. Verifique no webhook.site se o webhook foi recebido

---

**💡 Dica**: Use o webhook.site para desenvolvimento e testes. Para produção, configure uma URL HTTPS do seu servidor.
