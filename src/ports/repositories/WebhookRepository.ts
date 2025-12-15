import { Webhook } from "../../domain/entities/Webhook";

export interface WebhookRepository {
  /**
   * Salva um novo webhook
   */
  save(webhook: Webhook): Promise<Webhook>;

  /**
   * Busca webhook por ID interno
   */
  findById(id: string): Promise<Webhook | null>;

  /**
   * Busca webhook por ID público (ex: wh_abc123)
   */
  findByPublicId(publicId: string): Promise<Webhook | null>;

  /**
   * Lista webhooks de um merchant
   */
  findByMerchantId(
    merchantId: string,
    options?: { includeInactive?: boolean }
  ): Promise<Webhook[]>;

  /**
   * Busca webhooks ativos que escutam um evento específico
   */
  findActiveByEvent(
    merchantId: string,
    event: string,
    devMode: boolean
  ): Promise<Webhook[]>;

  /**
   * Atualiza um webhook existente
   */
  update(webhook: Webhook): Promise<Webhook>;

  /**
   * Deleta um webhook
   */
  delete(id: string): Promise<void>;

  /**
   * Conta webhooks de um merchant
   */
  countByMerchantId(merchantId: string): Promise<number>;
}

