import {
  WebhookNotFoundError,
  WebhookUnauthorizedError,
} from "../../domain/entities/Webhook";
import { WebhookRepository } from "../../ports/repositories/WebhookRepository";

interface DeleteWebhookRequest {
  webhookId: string;
  merchantId: string;
}

interface DeleteWebhookResponse {
  success: boolean;
  deletedId: string;
}

export class DeleteWebhook {
  constructor(private readonly webhookRepository: WebhookRepository) {}

  async execute(request: DeleteWebhookRequest): Promise<DeleteWebhookResponse> {
    const { webhookId, merchantId } = request;

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

    // Deletar
    await this.webhookRepository.delete(webhook.id);

    return {
      success: true,
      deletedId: webhook.id,
    };
  }
}

// Re-export errors for use in routes
export { WebhookNotFoundError, WebhookUnauthorizedError };

