/**
 * Consumer para processar eventos charge.expired
 *
 * Dispara webhooks do Turbofy para o integrador quando a cobrança expira,
 * evitando que o integrador tenha que fazer polling.
 */

import { DispatchWebhooks } from "../../application/useCases/DispatchWebhooks";
import { EventHandler, RabbitMQConsumer } from "../adapters/messaging/RabbitMQConsumer";
import { FetchWebhookDeliveryAdapter } from "../adapters/webhooks/FetchWebhookDeliveryAdapter";
import { PrismaChargeRepository } from "../database/PrismaChargeRepository";
import { prisma } from "../database/prismaClient";
import { PrismaWebhookLogRepository } from "../database/repositories/PrismaWebhookLogRepository";
import { PrismaWebhookRepository } from "../database/repositories/PrismaWebhookRepository";
import { logger } from "../logger";

export class ChargeExpiredConsumer implements EventHandler {
  private chargeRepository: PrismaChargeRepository;
  private dispatchWebhooks: DispatchWebhooks;

  constructor() {
    this.chargeRepository = new PrismaChargeRepository();

    const webhookRepository = new PrismaWebhookRepository(prisma);
    const webhookLogRepository = new PrismaWebhookLogRepository(prisma);
    const webhookDelivery = new FetchWebhookDeliveryAdapter();

    this.dispatchWebhooks = new DispatchWebhooks(
      webhookRepository,
      webhookLogRepository,
      webhookDelivery
    );
  }

  async handle(event: unknown): Promise<void> {
    const parsed = event as {
      traceId?: string;
      payload?: { chargeId?: string };
    };

    const chargeId = parsed.payload?.chargeId;
    if (!chargeId) {
      logger.warn({ event }, "charge.expired event without payload.chargeId");
      return;
    }

    const charge = await this.chargeRepository.findById(chargeId);
    if (!charge) {
      return;
    }

    const devMode = process.env.NODE_ENV !== "production";
    await this.dispatchWebhooks.execute({
      merchantId: charge.merchantId,
      event: "charge.expired",
      devMode,
      traceId: parsed.traceId,
      data: {
        chargeId: charge.id,
        status: charge.status,
        amountCents: charge.amountCents,
        currency: charge.currency,
        method: charge.method ?? null,
        externalRef: charge.externalRef ?? null,
        metadata: charge.metadata ?? null,
        expiredAt: charge.updatedAt.toISOString(),
      },
    });
  }
}

export async function startChargeExpiredConsumer(): Promise<RabbitMQConsumer> {
  const consumer = new RabbitMQConsumer([
    {
      eventType: "charge.expired",
      queueName: "turbofy.payments.charge.expired",
    },
  ]);

  const handler = new ChargeExpiredConsumer();
  consumer.registerHandler("charge.expired", handler);
  await consumer.start();

  logger.info("ChargeExpiredConsumer started");
  return consumer;
}

