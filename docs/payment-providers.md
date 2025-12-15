# Turbofy – Estratégia de Provedores de Pagamento

Centraliza regras para integrar provedores externos (Pix/Boleto) através da `PaymentProviderPort`.

---

## 1. Contrato (`backend/src/ports/PaymentProviderPort.ts`)
```ts
export interface PaymentProviderPort {
  issuePixCharge(input: PixIssueInput): Promise<PixIssueOutput>;
  issueBoletoCharge(input: BoletoIssueInput): Promise<BoletoIssueOutput>;
  getBalance?(): Promise<{ available: number; waiting: number }>;
  getReceivedPix?(params?: PixFilter): Promise<PixReceived[]>;
}
```
- Sempre retornamos valores em centavos e datas ISO.
- Métodos extras (saldo, Pix recebidos) são opcionais e devem ser protegidos por feature flags.

---

## 2. Factory (`PaymentProviderFactory`)
```mermaid
graph TD
    A[PaymentProviderFactory] -->|create()| B{env.TRANSFEERA_ENABLED?}
    B -->|true| C[TransfeeraPaymentProviderAdapter]
    B -->|false| D[StubPaymentProviderAdapter]
    A -->|createForMerchant(merchantId)| E{Credenciais BSPay?}
    E -->|sim| F[BspayPaymentProviderAdapter]
    E -->|não| B
```
- `create()` usa variável global `TRANSFEERA_ENABLED`.
- `createForMerchant(merchantId)` consulta `PrismaProviderCredentialsRepository` para descobrir se o merchant configurou BSPay. Caso não, cai para Transfeera (se habilitado) ou Stub.

---

## 3. Provedores Suportados
| Provider | Arquivo | Quando usar | Notas |
| --- | --- | --- | --- |
| **Transfeera** | `backend/src/infrastructure/adapters/payment/TransfeeraPaymentProviderAdapter.ts` | Ambiente real ou sandbox, quando `TRANSFEERA_ENABLED=true`. | Requer OAuth2 `client_id/secret`, chave Pix e secrets configurados no `.env`. |
| **BSPay** | `backend/src/infrastructure/adapters/payment/BspayPaymentProviderAdapter.ts` | Merchants com credenciais próprias salvas via dashboard. | Credenciais armazenadas criptografadas (usar `PrismaProviderCredentialsRepository`). |
| **Stub** | `backend/src/infrastructure/adapters/payment/StubPaymentProviderAdapter.ts` | Desenvolvimento local e testes sem integrações externas. | Gera QR/Boleto fictícios com validade curta. |

---

## 4. Credenciais de Merchant
- Tabela Prisma: `provider_credentials` (ver `backend/prisma/schema.prisma`).
- Criptografadas usando `TURBOFY_CREDENTIALS_ENC_KEY`.
- Repositório: `PrismaProviderCredentialsRepository`.
- Campos chave:
  - `merchantId`
  - `provider` (`"BSPAY"`, `"TRANSFEERA"`, etc.)
  - `data` (JSON encriptado)
  - `createdAt` / `updatedAt`

### Fluxo de Onboarding BSPay
1. Merchant envia credenciais via dashboard (endpoint TBD).
2. Backend cifra e salva via `PrismaProviderCredentialsRepository.upsert`.
3. `PaymentProviderFactory.createForMerchant` detecta o registro e instancia `BspayPaymentProviderAdapter`.

---

## 5. Variáveis de Ambiente (Transfeera)
```env
TRANSFEERA_ENABLED=true
TRANSFEERA_CLIENT_ID=...
TRANSFEERA_CLIENT_SECRET=...
TRANSFEERA_API_URL=https://api-sandbox.transfeera.com
TRANSFEERA_LOGIN_URL=https://login-api-sandbox.transfeera.com
TRANSFEERA_PIX_KEY=chave@exemplo.com
TRANSFEERA_WEBHOOK_SECRET=<<32+ chars>>
CONTACERTA_API_URL=https://contacerta-api-sandbox.transfeera.com
```
- Toda validação é centralizada em `backend/src/config/env.ts`.
- Em produção use os endpoints `https://api.mtls.transfeera.com`.

---

## 6. Banking / Settlements
- Factory: `BankingFactory` seleciona `TransfeeraBankingAdapter` quando `TRANSFEERA_ENABLED=true`, senão `StubBankingAdapter`.
- `TransfeeraBankingAdapter`:
  - Validação prévia via Conta Certa (BASICA)
  - Cria lote `/batch` e transferência `/batch/{id}/transfer` com `auto_close`
  - Mapeia status: FINALIZADO/TRANSFERIDO → COMPLETED; DEVOLVIDO/FALHA → FAILED; demais → PROCESSING
- Webhook `Transfer` atualiza Settlement (arquivo `transfeeraWebhookRoutes.ts`)

---

## 7. Boas Práticas ao Implementar Adapters
- **Idempotência**: utilize `idempotencyKey` ao falar com o provedor (quando suportado).
- **Timeouts/retries**: encapsule chamadas HTTP com retry exponencial (ex.: `p-retry`).
- **Logs**: não exponha payloads sensíveis; registre `provider`, `merchantId`, `traceId`.
- **Mapeamento de erros**: converta códigos externos para erros de domínio (ex.: `PaymentProviderError`).
- **Testes**: criar suites unitárias simulando respostas do provedor e cenários de falha.

---

## 8. Webhooks
- Endpoint: `POST /webhooks/transfeera` (`backend/src/infrastructure/http/routes/transfeeraWebhookRoutes.ts`).
- Responsabilidades:
  - Validar assinatura (usar `TRANSFEERA_WEBHOOK_SECRET`).
  - Atualizar `Charge` via `ChargeRepository`.
  - Registrar logs e eventos (ex.: `charge.paid`).
- Estados reconciliados alimentam casos de uso em Settlements/Reconciliations.

---

## 9. Testes Locais
- **Stub**: default quando `TRANSFEERA_ENABLED=false`. Ideal para desenvolvimento rápido.
- **Transfeera Sandbox**:
  - Gere credenciais no portal sandbox.
  - Utilize documentos de teste da [documentação oficial](https://docs.transfeera.dev/reference/sandbox).
  - Execute `pnpm --filter backend dev` com as variáveis setadas.
- **BSPay**: armazenar credenciais fake no banco (seed ou script) e confirmar que `PaymentProviderFactory.createForMerchant` seleciona o adapter correto.

---

## 10. Próximos Passos
- Documentar webhook específico para BSPay (quando disponível).
- Adicionar métricas Prometheus por provedor (latência, taxa de erro).
- Expandir `PaymentProviderPort` para suportar cancelamento/consulta de status.

Atualize este arquivo sempre que um novo provedor for integrado ou a estratégia mudar.

