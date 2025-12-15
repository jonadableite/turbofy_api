# Turbofy - Cobranças (Charges)

## Domínio
- Entidade `Charge`: representa uma cobrança com `merchantId`, `amountCents`, `currency='BRL'`, `status`, `method`, `expiresAt`, `idempotencyKey`, `externalRef`, `metadata`, e campos de emissão `pixQrCode`, `pixCopyPaste`, `boletoUrl`.
- Entidade `ChargeSplit`: define split por `amountCents` fixo ou `percentage` (0-100). Método `computeAmountForTotal(totalCents)` valida e retorna valor do split.
- Entidade `Fee`: taxa aplicada à cobrança; método `applyToTotal(totalCents)` retorna o valor após desconto.

## Schemas (Zod)
- `CreateChargeRequestSchema`: valida entrada de `POST /charges` com `merchantId (uuid)`, `amountCents (int>0)`, `currency ('BRL')`, `description`, `method ('PIX'|'BOLETO')`, `expiresAt (ISO datetime)`, `idempotencyKey (>=8)`, `externalRef`, `metadata (record<string, unknown>)`.
- `CreateChargeResponseSchema`: formato de saída incluindo dados da cobrança e payloads `pix`/`boleto` quando aplicável.

## Ports
- `ChargeRepository`: persistência de `Charge`, com métodos `findById`, `findByIdempotencyKey`, `create`, `update`, `addSplit`, `addFee`.
- `PaymentProviderPort`: emissão para provedor externo com `emitPix(charge)` e `emitBoleto(charge)`; retorna QR Code/copia e cola ou URL do boleto.
- `MessagingPort`: publicação de eventos (`charge.created`, `charge.paid`, etc.).

## Adapters
- `PrismaChargeRepository`: implementação com Prisma. Campo JSON `metadata` incluído apenas quando definido.
- `StubPaymentProviderAdapter`: stub para emissão de Pix/Boleto durante desenvolvimento, retornando payloads simulados.
- `InMemoryMessagingAdapter`: publicação em memória para testes.

## Erros e Observabilidade
- Validações de domínio lançam `Error` com mensagens específicas; camada HTTP deve mapear para `400`/`422` conforme necessidade.
- Logs estruturados devem incluir `traceId`, `useCase`, `entityId`.

## Testes
- Testes unitários em `src/domain/__tests__` cobrem `Charge`, `ChargeSplit` e `Fee`.
- Para executar: `pnpm test`. Em ambientes onde Jest não encontra testes, usar `pnpm test -- --passWithNoTests` temporariamente e validar build com `pnpm run build`.

## Próximos passos
- Caso de uso `CreateCharge` com idempotência, emissão Pix/Boleto e evento `charge.created`.
- Rota `POST /charges` com validação via Zod e mapeamento de erros.
- Integração com mensageria (RabbitMQ) e OpenTelemetry.