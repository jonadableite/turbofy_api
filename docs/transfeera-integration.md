# Integração com Transfeera

Este documento descreve a integração do Turbofy Gateway com a API da Transfeera para processamento de pagamentos Pix e Boletos.

## Configuração

### Variáveis de Ambiente

Adicione as seguintes variáveis ao seu arquivo `.env`:

```env
# Habilitar/desabilitar Transfeera
TRANSFEERA_ENABLED=true

# Credenciais da Transfeera (obtidas na plataforma)
TRANSFEERA_CLIENT_ID=seu_client_id_aqui
TRANSFEERA_CLIENT_SECRET=seu_client_secret_aqui

# URLs da API (sandbox por padrão)
TRANSFEERA_API_URL=https://api-sandbox.transfeera.com
TRANSFEERA_LOGIN_URL=https://login-api-sandbox.transfeera.com

# Chave Pix registrada na Transfeera para recebimentos
TRANSFEERA_PIX_KEY=email@exemplo.com
```

> **Importante:** `TRANSFEERA_LOGIN_URL` deve ser a **base URL** (sem `/authorization`).  
> O Turbofy sempre chama `${TRANSFEERA_LOGIN_URL}/authorization`. Se você colar a URL completa com `/authorization`,
> o código normaliza automaticamente (remove o sufixo) para evitar `.../authorization/authorization`.

### Ambiente Sandbox

1. Acesse `https://app-sandbox.transfeera.com`
2. Faça login com as credenciais fornecidas por email
3. Acesse **Minha Conta** > **Credenciais de APIs**
4. Copie o `Client ID` e `Client Secret`
5. Configure as variáveis de ambiente acima

### Ambiente Produção

1. Entre em contato com o suporte da Transfeera para habilitar produção
2. Informe o IP de saída da sua máquina/servidor
3. Acesse `https://app.transfeera.com`
4. Gere novas credenciais em produção
5. Atualize as variáveis de ambiente:

   ```env
   TRANSFEERA_API_URL=https://api.mtls.transfeera.com
   TRANSFEERA_LOGIN_URL=https://login-api.mtls.transfeera.com
CONTACERTA_API_URL=https://contacerta-api.mtls.transfeera.com
   ```

> A Transfeera pode fornecer domínios alternativos (ex.: `login-api.transfeera.com`).  
> Use sempre os endpoints de produção informados pela Transfeera para sua conta e mantenha **login/api no mesmo ambiente** (prod com prod, sandbox com sandbox).

## Arquitetura

A integração segue a arquitetura hexagonal do Turbofy:

```text
┌─────────────────────────────────────────┐
│         Application Layer               │
│  (CreateCharge use case)                │
└──────────────┬──────────────────────────┘
               │
               │ PaymentProviderPort (interface)
               │
┌──────────────▼──────────────────────────┐
│      Infrastructure Layer                │
│  ┌────────────────────────────────────┐ │
│  │ PaymentProviderFactory              │ │
│  │  - Escolhe adapter baseado em env  │ │
│  └──────────┬─────────────────────────┘ │
│             │                           │
│  ┌──────────▼─────────────────────────┐ │
│  │ TransfeeraPaymentProviderAdapter   │ │
│  │  - Implementa PaymentProviderPort   │ │
│  └──────────┬─────────────────────────┘ │
│             │                           │
│  ┌──────────▼─────────────────────────┐ │
│  │ TransfeeraClient                   │ │
│  │  - Cliente HTTP                     │ │
│  │  - Autenticação OAuth2              │ │
│  │  - Cache de token                   │ │
│  └────────────────────────────────────┘ │
└──────────────────────────────────────────┘
```

## Componentes

### TransfeeraClient

Cliente HTTP que gerencia:
- Autenticação OAuth2 com `client_credentials`
- Cache de token de acesso (renovação automática)
- Requisições para todos os endpoints da Transfeera
- Recorrências de payout (listar, listar pagamentos, cancelar)

**Métodos principais:**

**Chaves Pix:**
- `createPixKey()` - Criar chave Pix
- `listPixKeys()` - Listar chaves Pix
- `getPixKeyById()` - Consultar chave por ID
- `deletePixKey()` - Excluir chave Pix
- `verifyPixKey()` - Verificar chave com código
- `claimPixKey()` - Reivindicar chave
- `confirmPixKeyClaim()` / `cancelPixKeyClaim()` - Confirmar/cancelar reivindicação

**QR Codes:**
- `createStaticQrCode()` - Criar QR Code estático
- `createImmediateCharge()` - Criar cobrança imediata (Pix)
- `createDueDateCharge()` - Criar cobrança com vencimento (Boleto)
- `listQrCodes()` - Listar QR Codes com filtros
- `getQrCode()` - Consultar QR Code por ID/txid
- `revokeQrCode()` - Revogar QR Code

**CashIn (Recebimentos):**
- `getCashIn()` - Consultar Pix recebidos
- `getCashInByEnd2EndId()` - Consultar por end2end_id
- `requestCashInRefund()` - Solicitar devolução
- `listCashInRefunds()` - Listar devoluções

**Cobranças (Charges V2):**
- `createChargeV2()` - Criar cobrança (formato novo)
- `listCharges()` - Listar cobranças com filtros
- `getChargeV2()` - Consultar cobrança
- `cancelChargeV2()` - Cancelar cobrança
- `downloadChargePdf()` - Download PDF do recebível

**Links de Pagamento:**
- `createPaymentLink()` - Criar link de pagamento
- `listPaymentLinks()` - Listar links
- `deletePaymentLink()` - Excluir link

**Batches e Transferências (Payouts):**
- `createBatch()` - Criar lote
- `getBatch()` / `listBatches()` - Consultar lotes
- `closeBatch()` / `deleteBatch()` - Fechar/excluir lote
- `createTransfer()` - Criar transferência
- `getTransfer()` / `listTransfersInBatch()` - Consultar transferências
- `deleteTransfer()` - Excluir transferência

**Boletos:**
- `consultBillet()` - Consultar boleto na CIP
- `createBillet()` - Criar boleto em lote
- `listBilletsInBatch()` / `listBillets()` - Listar boletos
- `getBillet()` - Consultar boleto
- `deleteBillet()` - Excluir boleto

**Saldo e Extrato:**
- `getBalance()` - Consultar saldo
- `withdrawBalance()` - Resgatar saldo
- `requestStatementReport()` - Solicitar relatório
- `getStatementReport()` - Consultar relatório

**Recorrências:**
- `listPayoutRecurrences()` - Listar recorrências de payout
- `listPayoutsByRecurrence(id)` - Listar pagamentos de uma recorrência
- `cancelPayoutRecurrence(id)` - Cancelar recorrência ativa

**Validações (Conta Certa):**
- `listBanks()` - Listar bancos
- `createValidation()` - Criar validação básica/micro depósito
- `getValidation()` / `listValidations()` - Consultar validações
- `validatePixKey()` - Validar chave no DICT
- `parsePixQrCode()` - Decodificar Pix copia e cola

**Pix Automático (Beta):**
- `createPixAutomaticAuthorization()` / `listPixAutomaticAuthorizations()` / `getPixAutomaticAuthorization()` / `cancelPixAutomaticAuthorization()` / `getPixAutomaticAuthorizationCancellation()`
- `createPixAutomaticPaymentIntent()` / `listPixAutomaticPaymentIntents()` / `getPixAutomaticPaymentIntent()` / `cancelPixAutomaticPaymentIntent()` / `getPixAutomaticPaymentIntentCancellation()`

**Contas Digitais:**
- `createAccount()` / `listAccounts()` / `getAccount()` / `closeAccount()`

**MED (Infrações):**
- `listMedInfractions()` / `getMedInfraction()`
- `submitMedInfractionAnalysisBatch()` / `submitMedInfractionAnalysis()`

**Webhooks Conta Certa:**
- `createContaCertaWebhook()` / `listContaCertaWebhooks()` / `updateContaCertaWebhook()` / `deleteContaCertaWebhook()`
- `listContaCertaWebhookEvents()` / `retryContaCertaWebhookEvents()`

**Webhooks Transfeera (principal):**
- `createTransfeeraWebhook()` / `listTransfeeraWebhooks()` / `updateTransfeeraWebhook()` / `deleteTransfeeraWebhook()`
- `listTransfeeraWebhookEvents()`

## Sandbox – Chaves Pix mapeadas para erros

Use para testar fluxos de erro em transferências (`destination_bank_account.pix_key`). Qualquer chave fora desta lista segue fluxo de sucesso.

**E-mail**
- `chave.pix15@transfeera.com` → Chave não encontrada
- `chave.pix16@transfeera.com` → Conta salário não aceita
- `chave.pix25@transfeera.com` → Falha após tentativas (destino)
- `chave.pix35@transfeera.com` → Documento divergente do titular

**Chave aleatória (EVP)**
- `3718a543-bd10-4488-8b6b-f71aef289815` → Chave não encontrada
- `3718a543-bd10-4488-8b6b-f71aef289816` → Conta salário não aceita
- `3718a543-bd10-4488-8b6b-f71aef289825` → Falha após tentativas (destino)
- `3718a543-bd10-4488-8b6b-f71aef289835` → Documento divergente do titular

**Telefone**
- `+5511912341215` → Chave não encontrada
- `+5511912341216` → Conta salário não aceita
- `+5511912341225` → Falha após tentativas (destino)
- `+5511912341235` → Documento divergente do titular

**CPF**
- `784.933.530-94` → Chave não encontrada
- `827.188.890-04` → Conta salário não aceita
- `962.348.940-46` → Falha após tentativas (destino)

**CNPJ**
- `98.702.951/0001-07` → Chave não encontrada
- `65.142.521/0001-29` → Conta salário não aceita
- `63.071.277/0001-25` → Falha após tentativas (destino)

## Segurança e Conformidade (Transfeera)

- Certificações: **ISO27001**, **ISO27701** (emitidas em dez/2023).
- Padrões e controles: CIS, LGPD, normativas BCB (Pix), WAF, TLS hardening, DDoS, OWASP rules.
- Autenticação: OAuth2 (client credentials); apps com MFA + política de senha forte.
- Segurança de SDLC: SAST em pipeline, DAST semanal, SIEM com alertas 24/7.
- Webhooks:
  - Header `Transfeera-Signature: t=timestamp,v1=HMAC_SHA256(payload)`; usar `signature_secret` obtido na criação do webhook.
  - Monte string `${timestamp}.${rawPayload}` (payload exatamente como recebido) e valide HMAC com o secret.
  - Ignore schemas ≠ v1; compare assinatura via equals timing-safe (ideal).
- Boas práticas: validar campos com Zod, nunca logar secrets/tokens, seguir rate limits (auth 10 rps, validation 20 rps, Pix/bank validation 12 tentativas/hora por chave/dados).

### TransfeeraPaymentProviderAdapter

Adapter que implementa `PaymentProviderPort`:
- Converte valores de centavos para reais
- Gera `txid` único conforme especificação Transfeera
- Mapeia erros da Transfeera para erros do domínio

### PaymentProviderFactory

Factory que escolhe o adapter baseado em `TRANSFEERA_ENABLED`:
- `true` → `TransfeeraPaymentProviderAdapter`
- `false` → `StubPaymentProviderAdapter` (desenvolvimento)

## Webhooks

### Configuração

1. Configure a URL do webhook na plataforma Transfeera:
   ```
   https://seu-dominio.com/webhooks/transfeera
   ```

2. O endpoint aceita eventos:
   - `CashIn` - Pix recebido
   - `CashInRefund` - Devolução de Pix
   - `PixKey` - Atualização de chave Pix
   - `ChargeReceivable` - Atualização de recebível
   - `Payin` - Recebimento via cartão
   - `PaymentLink` - Atualização de link de pagamento

### Processamento

O webhook:
1. Recebe o evento da Transfeera
2. Responde imediatamente com `200 OK`
3. Processa o evento assincronamente
4. Atualiza a cobrança correspondente no banco

**Matching de cobranças:**
- Por `integration_id` (usado como `externalRef` na cobrança)
- Por `txid` (futuro - requer campo adicional no schema)

## Fluxo de Cobrança Pix

1. Cliente cria cobrança via `POST /charges`
2. `CreateCharge` use case é executado
3. `PaymentProviderFactory` cria `TransfeeraPaymentProviderAdapter`
4. Adapter chama `TransfeeraClient.createImmediateCharge()`
5. Cliente autentica (se necessário) e cria cobrança na Transfeera
6. QR Code e payload são retornados
7. Cobrança é salva no banco com dados do QR Code
8. Quando pagamento é recebido, Transfeera envia webhook
9. Webhook atualiza status da cobrança para `PAID`

## Fluxo de Cobrança Boleto

1. Similar ao Pix, mas usa `createDueDateCharge()`
2. Retorna QR Code Pix como alternativa (Transfeera usa Pix para boletos)
3. Em produção, considere usar endpoint específico de boletos

## Transferências / Payouts (Settlements)

- Adapter: `TransfeeraBankingAdapter` (implementa `BankingPort`)
- Factory: `BankingFactory` decide entre Transfeera e Stub
- Fluxo:
  1. `ProcessSettlement` chama `processSettlement` com `settlementId`
  2. Adapter valida dados bancários via Conta Certa (BASICA)
  3. Cria lote (`/batch`) e transferência (`/batch/{id}/transfer`) com `auto_close`
  4. Transfeera processa a transferência
  5. Webhook `Transfer` atualiza o Settlement (FINALIZADO/DEVOLVIDO/FALHA)

### Mapeamento de status
- `FINALIZADO`/`TRANSFERIDO` → `COMPLETED`
- `DEVOLVIDO`/`FALHA` → `FAILED`
- Demais → `PROCESSING`

## Validação de Conta (Conta Certa)

- Cliente: reutiliza o token OAuth2; base `CONTACERTA_API_URL` (sandbox: `https://contacerta-api-sandbox.transfeera.com`)
- Métodos implementados:
  - `listBanks()` - GET `/bank`
  - `createValidation(type, payload)` - POST `/validation?type=BASICA|MICRO_DEPOSITO`
  - `getValidation(id)` - GET `/validation/{id}`
  - `listValidations(params)` - GET `/validation`
- Uso no payout: validação BASICA antes de criar transferência; se inválida, retorna erro com mensagem do provedor.

## Tratamento de Erros

Todos os erros da Transfeera são:
- Logados com contexto completo
- Convertidos para erros do domínio quando possível
- Retornados ao cliente com mensagem apropriada

## Testes

### Sandbox

Use os documentos e chaves de teste da Transfeera:
- Documentos: https://docs.transfeera.dev/reference/sandbox#documentos-para-testes
- Chaves Pix: https://docs.transfeera.dev/reference/sandbox#chaves-pix

### Exemplo de Requisição

```bash
curl -X POST http://localhost:3000/charges \
  -H "Content-Type: application/json" \
  -H "X-Idempotency-Key: test-123" \
  -d '{
    "merchantId": "uuid-do-merchant",
    "amountCents": 10000,
    "currency": "BRL",
    "method": "PIX",
    "description": "Teste de cobrança"
  }'
```

## Referências

- [Documentação Transfeera](https://docs.transfeera.dev/reference/endpoints)
- [Autenticação](https://docs.transfeera.dev/reference/autenticacao)
- [Webhooks](https://docs.transfeera.dev/reference/webhooks)

