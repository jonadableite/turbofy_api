# Webhooks para Rifeiro (Gateway Pix)

## Visão Geral

Permite que Rifeiros configurem uma URL para receber eventos de pagamentos Pix do gateway (via adquirente Transfeera). O backend registra o webhook na adquirente, armazena o `signature_secret` de forma criptografada e valida a assinatura HMAC-SHA256 em cada evento recebido.

## Endpoints Backend

- `POST /rifeiro/webhooks` — cria webhook (valida HTTPS, tipo RIFEIRO, rate-limit 10/min)
- `GET /rifeiro/webhooks` — lista webhooks do merchant
- `PUT /rifeiro/webhooks/:id` — atualiza URL/objectTypes
- `DELETE /rifeiro/webhooks/:id` — remove webhook
- `POST /rifeiro/webhooks/:id/test` — envia evento de teste com HMAC

## Segurança

- Assinatura HMAC-SHA256: `Transfeera-Signature: t=<timestamp>,v1=<hash>`
- Mensagem: `${timestamp}.${rawPayload}` usando o `signature_secret` descriptografado
- `signature_secret` armazenado criptografado (AES-256-GCM, `TURBOFY_CREDENTIALS_ENC_KEY`)
- URLs em produção devem ser HTTPS e não podem apontar para IPs privados
- Rate limit: 10 req/min por merchant nas rotas de webhook

## Fluxo de Configuração

1) Frontend chama `POST /rifeiro/webhooks` com `url` e `objectTypes`
2) Backend registra webhook na adquirente e salva `signature_secret` criptografado
3) Eventos chegam em `/webhooks/transfeera`, assinatura validada com secret do banco
4) Eventos são processados e registrados em `WebhookAttempt`

## Exemplo de Validação (Node.js)

```ts
const header = req.headers["transfeera-signature"] as string;
const [t, v1] = header.split(",").map((p) => p.split("=")[1]);
const signed = `${t}.${rawPayload}`;
const expected = crypto.createHmac("sha256", secret).update(signed).digest("hex");
const valid = crypto.timingSafeEqual(Buffer.from(v1, "hex"), Buffer.from(expected, "hex"));
```

## Tipos de Eventos Principais

- `CashIn` — Pix recebido
- `CashInRefund` — devolução de Pix
- `ChargeReceivable` — atualização de recebível
- `PaymentLink`, `Payin`, `Transfer` — eventos adicionais suportados

## Troubleshooting

- 401 INVALID_SIGNATURE: conferir header `Transfeera-Signature` e usar payload bruto
- 401 WEBHOOK_NOT_CONFIGURED: webhook não cadastrado para `account_id` do evento
- 400 WEBHOOK_URL_HTTPS_REQUIRED: usar HTTPS em produção
- 429 rate limit: aguardar 60s antes de novas tentativas

