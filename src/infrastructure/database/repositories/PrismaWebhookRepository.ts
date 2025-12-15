import { PrismaClient, Webhook as PrismaWebhook, WebhookStatus as PrismaWebhookStatus } from "@prisma/client";
import { Webhook, WebhookStatus } from "../../../domain/entities/Webhook";
import { WebhookRepository } from "../../../ports/repositories/WebhookRepository";

export class PrismaWebhookRepository implements WebhookRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async save(webhook: Webhook): Promise<Webhook> {
    const data = {
      id: webhook.id,
      publicId: webhook.publicId,
      merchantId: webhook.merchantId,
      name: webhook.name,
      url: webhook.url,
      secret: webhook.secret,
      events: webhook.events,
      status: webhook.status as PrismaWebhookStatus,
      failureCount: webhook.failureCount,
      lastCalledAt: webhook.lastCalledAt,
      lastSuccess: webhook.lastSuccess,
      lastFailure: webhook.lastFailure,
      lastError: webhook.lastError,
      devMode: webhook.devMode,
      createdAt: webhook.createdAt,
      updatedAt: webhook.updatedAt,
    };

    const saved = await this.prisma.webhook.create({
      data,
    });

    return this.mapToEntity(saved);
  }

  async findById(id: string): Promise<Webhook | null> {
    const webhook = await this.prisma.webhook.findUnique({
      where: { id },
    });

    if (!webhook) return null;

    return this.mapToEntity(webhook);
  }

  async findByPublicId(publicId: string): Promise<Webhook | null> {
    const webhook = await this.prisma.webhook.findUnique({
      where: { publicId },
    });

    if (!webhook) return null;

    return this.mapToEntity(webhook);
  }

  async findByMerchantId(
    merchantId: string,
    options?: { includeInactive?: boolean }
  ): Promise<Webhook[]> {
    const where: { merchantId: string; status?: { not: PrismaWebhookStatus } } = { merchantId };

    if (!options?.includeInactive) {
      where.status = { not: "INACTIVE" as PrismaWebhookStatus };
    }

    const webhooks = await this.prisma.webhook.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    return webhooks.map((w) => this.mapToEntity(w));
  }

  async findActiveByEvent(
    merchantId: string,
    event: string,
    devMode: boolean
  ): Promise<Webhook[]> {
    const webhooks = await this.prisma.webhook.findMany({
      where: {
        merchantId,
        status: "ACTIVE" as PrismaWebhookStatus,
        devMode,
        events: {
          has: event,
        },
      },
    });

    return webhooks.map((w) => this.mapToEntity(w));
  }

  async update(webhook: Webhook): Promise<Webhook> {
    const updated = await this.prisma.webhook.update({
      where: { id: webhook.id },
      data: {
        name: webhook.name,
        url: webhook.url,
        events: webhook.events,
        status: webhook.status as PrismaWebhookStatus,
        failureCount: webhook.failureCount,
        lastCalledAt: webhook.lastCalledAt,
        lastSuccess: webhook.lastSuccess,
        lastFailure: webhook.lastFailure,
        lastError: webhook.lastError,
        updatedAt: webhook.updatedAt,
      },
    });

    return this.mapToEntity(updated);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.webhook.delete({
      where: { id },
    });
  }

  async countByMerchantId(merchantId: string): Promise<number> {
    return this.prisma.webhook.count({
      where: { merchantId },
    });
  }

  private mapToEntity(prismaWebhook: PrismaWebhook): Webhook {
    return Webhook.fromPersistence({
      id: prismaWebhook.id,
      publicId: prismaWebhook.publicId,
      merchantId: prismaWebhook.merchantId,
      name: prismaWebhook.name,
      url: prismaWebhook.url,
      secret: prismaWebhook.secret,
      events: prismaWebhook.events,
      status: prismaWebhook.status as WebhookStatus,
      failureCount: prismaWebhook.failureCount,
      lastCalledAt: prismaWebhook.lastCalledAt,
      lastSuccess: prismaWebhook.lastSuccess,
      lastFailure: prismaWebhook.lastFailure,
      lastError: prismaWebhook.lastError,
      devMode: prismaWebhook.devMode,
      createdAt: prismaWebhook.createdAt,
      updatedAt: prismaWebhook.updatedAt,
    });
  }
}

