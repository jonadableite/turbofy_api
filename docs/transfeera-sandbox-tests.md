# Testes de Integração - Transfeera Sandbox

Guia rápido para validar a integração diretamente nos endpoints da Transfeera (sandbox) usando as credenciais fornecidas. Inclui casos de erro mapeados (CPF/CNPJ/Chaves Pix) para garantir cobertura de validações.

## Pré-requisitos

- Variáveis de ambiente preenchidas em `.env` ou exportadas no shell:
  - `TRANSFEERA_CLIENT_ID`, `TRANSFEERA_CLIENT_SECRET`
  - `CONTACERTA_CLIENT_ID`, `CONTACERTA_CLIENT_SECRET`
  - `TRANSFEERA_LOGIN_URL=https://login-api-sandbox.transfeera.com`
  - `TRANSFEERA_API_URL=https://api-sandbox.transfeera.com`
  - `CONTACERTA_API_URL=https://contacerta-api-sandbox.transfeera.com`
- `curl` instalado.

## Script bash (smoke) com casos de erro sandbox

Salve como `scripts/run-transfeera-smoke.sh` e execute:

```bash
#!/usr/bin/env bash
set -euo pipefail

LOGIN_URL="${TRANSFEERA_LOGIN_URL:-https://login-api-sandbox.transfeera.com}"
API_URL="${TRANSFEERA_API_URL:-https://api-sandbox.transfeera.com}"
VALIDATION_URL="${CONTACERTA_API_URL:-https://contacerta-api-sandbox.transfeera.com}"

echo "🔐 Obtendo token (payments)..."
PAYMENTS_TOKEN=$(curl -s -X POST "${LOGIN_URL}/authorization" \
  -H "Content-Type: application/json" \
  -d "{\"grant_type\":\"client_credentials\",\"client_id\":\"${TRANSFEERA_CLIENT_ID}\",\"client_secret\":\"${TRANSFEERA_CLIENT_SECRET}\"}" \
  | jq -r '.access_token')

echo "🔐 Obtendo token (Conta Certa)..."
VALIDATION_TOKEN=$(curl -s -X POST "${LOGIN_URL}/authorization" \
  -H "Content-Type: application/json" \
  -d "{\"grant_type\":\"client_credentials\",\"client_id\":\"${CONTACERTA_CLIENT_ID:-$TRANSFEERA_CLIENT_ID}\",\"client_secret\":\"${CONTACERTA_CLIENT_SECRET:-$TRANSFEERA_CLIENT_SECRET}\"}" \
  | jq -r '.access_token')

echo "🏦 Listando bancos com Pix habilitado..."
curl -s "${API_URL}/bank?pix=true" \
  -H "Authorization: Bearer ${PAYMENTS_TOKEN}" \
  -H "Accept: application/json" | jq '.[0:3]'

echo "✅ Validação BASICA (Conta Certa) com CPF de erro esperado 'Conta não encontrada'..."
curl -s -X POST "${VALIDATION_URL}/validation?type=BASICA" \
  -H "Authorization: Bearer ${VALIDATION_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Teste Conta",
    "cpf_cnpj": "784.933.530-94",
    "bank_code": "001",
    "agency": "0001",
    "account": "0000001",
    "account_digit": "0",
    "account_type": "CONTA_CORRENTE",
    "integration_id": "validation-smoke-1"
  }' | jq '.'

echo "📦 Criando lote de transferência com CPF que gera erro 'Conta não encontrada'..."
BATCH_ID=$(curl -s -X POST "${API_URL}/batch" \
  -H "Authorization: Bearer ${PAYMENTS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"type":"TRANSFERENCIA","auto_close":true,"name":"smoke-batch"}' | jq -r '.id')

echo "💸 Criando transferência com CPF de erro..."
curl -s -X POST "${API_URL}/batch/${BATCH_ID}/transfer" \
  -H "Authorization: Bearer ${PAYMENTS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "value": 10.5,
    "integration_id": "transfer-smoke-1",
    "idempotency_key": "transfer-smoke-1",
    "destination_bank_account": {
      "name": "Teste Recebedor",
      "cpf_cnpj": "784.933.530-94",
      "bank_code": "001",
      "agency": "0001",
      "account": "0000001",
      "account_digit": "0",
      "account_type": "CONTA_CORRENTE"
    }
  }' | jq '.'

echo "📋 Listando transferências do lote..."
curl -s "${API_URL}/batch/${BATCH_ID}/transfer" \
  -H "Authorization: Bearer ${PAYMENTS_TOKEN}" \
  -H "Accept: application/json" | jq '.'
```

### Casos de erro úteis (sandbox)

- CPFs (destination_bank_account.cpf_cnpj) para simular falhas: `784.933.530-94` (Conta não encontrada), `962.348.940-46` (Conta bloqueada), `210.578.740-19` (CPF/CNPJ divergente).
- Chaves Pix com erro: `chave.pix15@transfeera.com` (chave não encontrada), `3718a543-bd10-4488-8b6b-f71aef289815` (chave não encontrada), `+5511912341216` (conta salário).

> Observação: o script usa `jq` para formatação; instale com `brew install jq` ou ajuste para usar `python -m json.tool`.

