import {
  WebhookNotFoundError,
  WebhookUnauthorizedError,
} from "../../domain/entities/Webhook";
import { WebhookRepository } from "../../ports/repositories/WebhookRepository";

interface UpdateWebhookRequest {
  webhookId: string;
  merchantId: string;
  name?: string;
  url?: string;
  events?: string[];
  active?: boolean;
}

interface UpdateWebhookResponse {
  id: string;
  publicId: string;
  name: string;
  url: string;
  events: string[];
  status: string;
  devMode: boolean;
  updatedAt: Date;
}

export class UpdateWebhook {
  constructor(private readonly webhookRepository: WebhookRepository) {}

  async execute(request: UpdateWebhookRequest): Promise<UpdateWebhookResponse> {
    const { webhookId, merchantId, name, url, events, active } = request;

    // Buscar webhook (pode ser por ID interno ou público)
    let webhook = await this.webhookRepository.findById(webhookId);

    if (!webhook) {
      webhook = await this.webhookRepository.findByPublicId(webhookId);
    }

    if (!webhook) {
      throw new WebhookNotFoundError(webhookId);
    }

    // Verificar ownership
    if (webhook.merchantId !== merchantId) {
      throw new WebhookUnauthorizedError();
    }

    // Atualizar dados se fornecidos
    let updatedWebhook = webhook;

    if (name !== undefined || url !== undefined || events !== undefined) {
      updatedWebhook = webhook.update({ name, url, events });
    }

    // Ativar/Desativar se especificado
    if (active !== undefined) {
      updatedWebhook = active
        ? updatedWebhook.activate()
        : updatedWebhook.deactivate();
    }

    // Persistir
    const saved = await this.webhookRepository.update(updatedWebhook);

    return {
      id: saved.id,
      publicId: saved.publicId,
      name: saved.name,
      url: saved.url,
      events: saved.events,
      status: saved.status,
      devMode: saved.devMode,
      updatedAt: saved.updatedAt,
    };
  }
}

// Re-export errors for use in routes
export { WebhookNotFoundError, WebhookUnauthorizedError };

