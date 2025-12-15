import { Webhook } from "../../domain/entities/Webhook";
import { WebhookRepository } from "../../ports/repositories/WebhookRepository";

const MAX_WEBHOOKS_PER_MERCHANT = 10;

interface CreateWebhookRequest {
  merchantId: string;
  name: string;
  url: string;
  events: string[];
  devMode?: boolean;
}

interface CreateWebhookResponse {
  id: string;
  publicId: string;
  merchantId: string;
  name: string;
  url: string;
  secret: string; // Retornado apenas na criação
  events: string[];
  status: string;
  devMode: boolean;
  createdAt: Date;
}

export class WebhookLimitExceededError extends Error {
  constructor(limit: number) {
    super(`Limite de ${limit} webhooks por merchant atingido`);
    this.name = "WebhookLimitExceededError";
  }
}

export class CreateWebhook {
  constructor(private readonly webhookRepository: WebhookRepository) {}

  async execute(request: CreateWebhookRequest): Promise<CreateWebhookResponse> {
    const { merchantId, name, url, events, devMode } = request;

    // Verificar limite de webhooks
    const currentCount = await this.webhookRepository.countByMerchantId(merchantId);
    if (currentCount >= MAX_WEBHOOKS_PER_MERCHANT) {
      throw new WebhookLimitExceededError(MAX_WEBHOOKS_PER_MERCHANT);
    }

    // Criar webhook (validações estão na entidade)
    const { webhook, secret } = Webhook.create({
      merchantId,
      name,
      url,
      events,
      devMode,
    });

    // Persistir
    const saved = await this.webhookRepository.save(webhook);

    return {
      id: saved.id,
      publicId: saved.publicId,
      merchantId: saved.merchantId,
      name: saved.name,
      url: saved.url,
      secret, // Retornar secret apenas na criação
      events: saved.events,
      status: saved.status,
      devMode: saved.devMode,
      createdAt: saved.createdAt,
    };
  }
}

