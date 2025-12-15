import { randomUUID } from "crypto";
import { Webhook } from "../../domain/entities/Webhook";
import { WebhookDeliveryPort } from "../../ports/WebhookDeliveryPort";
import { WebhookLogRepository } from "../../ports/repositories/WebhookLogRepository";
import { WebhookRepository } from "../../ports/repositories/WebhookRepository";

const DEFAULT_TIMEOUT_MS = 10_000;
const RETRY_DELAYS_MS = [0, 1_000, 5_000];

interface DispatchWebhooksInput {
  merchantId: string;
  event: string;
  data: Record<string, unknown>;
  devMode: boolean;
  traceId?: string;
}

interface DispatchWebhooksOutput {
  delivered: number;
  attempted: number;
}

interface WebhookEventEnvelope {
  id: string;
  type: string;
  timestamp: string;
  merchantId: string;
  traceId?: string;
  data: Record<string, unknown>;
}

export class DispatchWebhooks {
  constructor(
    private readonly webhookRepository: WebhookRepository,
    private readonly webhookLogRepository: WebhookLogRepository,
    private readonly webhookDelivery: WebhookDeliveryPort
  ) {}

  async execute(input: DispatchWebhooksInput): Promise<DispatchWebhooksOutput> {
    const webhooks = await this.webhookRepository.findActiveByEvent(
      input.merchantId,
      input.event,
      input.devMode
    );

    if (webhooks.length === 0) {
      return { delivered: 0, attempted: 0 };
    }

    const envelope: WebhookEventEnvelope = {
      id: randomUUID(),
      type: input.event,
      timestamp: new Date().toISOString(),
      merchantId: input.merchantId,
      traceId: input.traceId,
      data: input.data,
    };

    const body = JSON.stringify(envelope);

    let delivered = 0;
    for (const wh of webhooks) {
      const ok = await this.deliverWithRetry({ webhook: wh, event: input.event, body, envelope });
      if (ok) {
        delivered += 1;
      }
    }

    return { delivered, attempted: webhooks.length };
  }

  private async deliverWithRetry(params: {
    webhook: Webhook;
    event: string;
    body: string;
    envelope: WebhookEventEnvelope;
  }): Promise<boolean> {
    let current = params.webhook;

    for (let idx = 0; idx < RETRY_DELAYS_MS.length; idx += 1) {
      const attemptNumber = idx + 1;
      const delayMs = RETRY_DELAYS_MS[idx];

      if (delayMs > 0) {
        await new Promise((r) => setTimeout(r, delayMs));
      }

      const ts = Date.now();
      const signedPayload = `${ts}.${params.body}`;
      const signature = Webhook.generateSignature(signedPayload, current.secret);

      const start = Date.now();
      try {
        const response = await this.webhookDelivery.post({
          url: current.url,
          timeoutMs: DEFAULT_TIMEOUT_MS,
          headers: {
            "content-type": "application/json",
            "user-agent": "Turbofy Webhooks/1.0",
            "turbofy-event-id": params.envelope.id,
            "turbofy-event-type": params.envelope.type,
            "turbofy-signature": `t=${ts},v1=${signature}`,
          },
          body: params.body,
        });

        const responseTimeMs = Date.now() - start;
        const success = response.status >= 200 && response.status < 300;

        await this.webhookLogRepository.create({
          webhookId: current.id,
          event: params.event,
          payload: params.envelope,
          responseCode: response.status,
          responseBody: response.responseBody,
          responseTimeMs,
          success,
          errorMessage: success ? null : `HTTP_${response.status}`,
          attemptNumber,
        });

        if (success) {
          current = await this.webhookRepository.update(current.markSuccess());
          return true;
        }

        current = await this.webhookRepository.update(current.markFailure(`HTTP_${response.status}`));
      } catch (err) {
        const responseTimeMs = Date.now() - start;
        const errorMessage = err instanceof Error ? err.message : "Unknown error";

        await this.webhookLogRepository.create({
          webhookId: current.id,
          event: params.event,
          payload: params.envelope,
          responseCode: null,
          responseBody: null,
          responseTimeMs,
          success: false,
          errorMessage,
          attemptNumber,
        });

        current = await this.webhookRepository.update(current.markFailure(errorMessage));
      }
    }

    return false;
  }
}

