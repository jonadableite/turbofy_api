/**
 * Use case: TestWebhook
 * 
 * Envia um evento de teste para um webhook específico
 * Permite que integradores validem a configuração do webhook
 * 
 * @security Verifica ownership do webhook
 * @testability Usa o mesmo fluxo de entrega real (DispatchWebhooks)
 */

import { randomUUID } from "crypto";
import { WebhookRepository } from "../../ports/repositories/WebhookRepository";
import { DispatchWebhooks } from "./DispatchWebhooks";

export interface TestWebhookInput {
  webhookId: string; // ID interno ou publicId
  merchantId: string; // merchantId do integrador autenticado
}

export interface TestWebhookOutput {
  eventId: string;
  sent: boolean;
  message: string;
}

export class WebhookNotFoundError extends Error {
  constructor(id: string) {
    super(`Webhook não encontrado: ${id}`);
    this.name = "WebhookNotFoundError";
  }
}

export class WebhookUnauthorizedError extends Error {
  constructor() {
    super("Não autorizado a testar este webhook");
    this.name = "WebhookUnauthorizedError";
  }
}

export class TestWebhook {
  constructor(
    private readonly webhookRepository: WebhookRepository,
    private readonly dispatchWebhooks: DispatchWebhooks
  ) {}

  async execute(input: TestWebhookInput): Promise<TestWebhookOutput> {
    // Buscar webhook (por ID interno ou publicId)
    let webhook = await this.webhookRepository.findById(input.webhookId);

    if (!webhook) {
      webhook = await this.webhookRepository.findByPublicId(input.webhookId);
    }

    if (!webhook) {
      throw new WebhookNotFoundError(input.webhookId);
    }

    // Validar ownership
    if (webhook.merchantId !== input.merchantId) {
      throw new WebhookUnauthorizedError();
    }

    // Gerar evento de teste
    const eventId = `evt_test_${randomUUID()}`;
    const traceId = `trace_test_${randomUUID()}`;

    // Payload de teste
    const testPayload = {
      id: eventId,
      message: "Este é um evento de teste do Turbofy",
      webhook: {
        id: webhook.publicId,
        name: webhook.name,
        url: webhook.url,
      },
      timestamp: new Date().toISOString(),
    };

    // Disparar usando o mesmo fluxo real
    // Usa evento especial "webhook.test"
    const result = await this.dispatchWebhooks.execute({
      merchantId: input.merchantId,
      event: "webhook.test",
      devMode: webhook.devMode,
      traceId,
      data: testPayload,
    });

    return {
      eventId,
      sent: result.published,
      message: result.published
        ? "Evento de teste publicado com sucesso. A entrega será processada de forma assíncrona."
        : "Falha ao publicar evento de teste. Tente novamente.",
    };
  }
}
