/**
 * Use case: DispatchWebhooks (Refatorado)
 * 
 * Publica eventos de webhook no RabbitMQ para processamento assíncrono
 * Não faz mais entrega HTTP direto (agora via WebhookDispatcherConsumer + WebhookDeliveryConsumer)
 * 
 * @scalability Processamento assíncrono via RabbitMQ permite throughput alto
 * @reliability Retry/backoff gerenciado por consumidores dedicados
 */

import { randomUUID } from "crypto";
import { MessagingPort } from "../../ports/MessagingPort";

interface DispatchWebhooksInput {
  merchantId: string;
  event: string;
  data: Record<string, unknown>;
  devMode: boolean;
  traceId?: string;
}

interface DispatchWebhooksOutput {
  published: boolean;
  eventId: string;
}

export interface WebhookEventEnvelope {
  id: string;
  type: string;
  timestamp: string;
  merchantId: string;
  traceId?: string;
  data: Record<string, unknown>;
}

export class DispatchWebhooks {
  constructor(private readonly messaging: MessagingPort) {}

  async execute(input: DispatchWebhooksInput): Promise<DispatchWebhooksOutput> {
    // Criar envelope do evento
    const envelope: WebhookEventEnvelope = {
      id: `evt_${randomUUID()}`,
      type: input.event,
      timestamp: new Date().toISOString(),
      merchantId: input.merchantId,
      traceId: input.traceId,
      data: input.data,
    };

    // Publicar no RabbitMQ para processamento assíncrono
    // O WebhookDispatcherConsumer vai:
    // 1. Buscar webhooks ACTIVE do merchant
    // 2. Criar WebhookDelivery para cada webhook
    // 3. Publicar na fila de entrega
    await this.messaging.publish({
      id: envelope.id,
      type: "webhook.dispatch",
      timestamp: envelope.timestamp,
      version: "v1",
      traceId: input.traceId,
      routingKey: `turbofy.webhooks.${input.event}`, // ex: turbofy.webhooks.charge.paid
      payload: envelope,
    });

    return {
      published: true,
      eventId: envelope.id,
    };
  }
}

