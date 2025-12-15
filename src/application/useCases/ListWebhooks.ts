import { Webhook } from "../../domain/entities/Webhook";
import { WebhookRepository } from "../../ports/repositories/WebhookRepository";

interface ListWebhooksRequest {
  merchantId: string;
  includeInactive?: boolean;
}

interface WebhookItem {
  id: string;
  publicId: string;
  name: string;
  url: string;
  events: string[];
  status: string;
  failureCount: number;
  lastCalledAt: Date | null;
  lastSuccess: Date | null;
  lastFailure: Date | null;
  lastError: string | null;
  devMode: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface ListWebhooksResponse {
  webhooks: WebhookItem[];
  total: number;
}

export class ListWebhooks {
  constructor(private readonly webhookRepository: WebhookRepository) {}

  async execute(request: ListWebhooksRequest): Promise<ListWebhooksResponse> {
    const { merchantId, includeInactive } = request;

    const webhooks = await this.webhookRepository.findByMerchantId(merchantId, {
      includeInactive,
    });

    return {
      webhooks: webhooks.map(this.mapToItem),
      total: webhooks.length,
    };
  }

  private mapToItem(webhook: Webhook): WebhookItem {
    return {
      id: webhook.id,
      publicId: webhook.publicId,
      name: webhook.name,
      url: webhook.url,
      events: webhook.events,
      status: webhook.status,
      failureCount: webhook.failureCount,
      lastCalledAt: webhook.lastCalledAt,
      lastSuccess: webhook.lastSuccess,
      lastFailure: webhook.lastFailure,
      lastError: webhook.lastError,
      devMode: webhook.devMode,
      createdAt: webhook.createdAt,
      updatedAt: webhook.updatedAt,
    };
  }
}

