/**
 * Use case: RotateWebhookSecret
 * 
 * Rotaciona o secret de um webhook, gerando um novo
 * Permite responder a vazamentos de segredo sem downtime
 * 
 * @security Gera novo secret forte e invalida o anterior
 * @maintainability Isolado para facilitar evolução (ex: grace period no futuro)
 */

import { randomBytes } from "crypto";
import { Webhook } from "../../domain/entities/Webhook";
import { WebhookRepository } from "../../ports/repositories/WebhookRepository";

export interface RotateWebhookSecretInput {
  webhookId: string; // ID interno ou publicId
  merchantId: string; // merchantId do integrador autenticado
}

export interface RotateWebhookSecretOutput {
  webhookId: string;
  publicId: string;
  newSecret: string; // Retornado apenas uma vez
  rotatedAt: string;
}

export class WebhookNotFoundError extends Error {
  constructor(id: string) {
    super(`Webhook não encontrado: ${id}`);
    this.name = "WebhookNotFoundError";
  }
}

export class WebhookUnauthorizedError extends Error {
  constructor() {
    super("Não autorizado a rotacionar secret deste webhook");
    this.name = "WebhookUnauthorizedError";
  }
}

const SECRET_BYTES = 32; // 256 bits

export class RotateWebhookSecret {
  constructor(private readonly webhookRepository: WebhookRepository) {}

  async execute(input: RotateWebhookSecretInput): Promise<RotateWebhookSecretOutput> {
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

    // Gerar novo secret forte
    const newSecret = randomBytes(SECRET_BYTES).toString("hex");

    // Atualizar webhook com novo secret
    // O Webhook.update não suporta alterar secret diretamente,
    // então criamos um novo Webhook com o secret atualizado
    const now = new Date();
    const updatedWebhook = Webhook.fromPersistence({
      ...webhook.toProps(),
      secret: newSecret,
      updatedAt: now,
    });

    // Persistir
    await this.webhookRepository.update(updatedWebhook);

    return {
      webhookId: updatedWebhook.id,
      publicId: updatedWebhook.publicId,
      newSecret, // Mostrado apenas uma vez
      rotatedAt: now.toISOString(),
    };
  }
}
