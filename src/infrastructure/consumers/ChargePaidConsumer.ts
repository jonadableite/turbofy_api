/**
 * Consumer para processar eventos charge.paid
 * 
 * Cria Enrollment automaticamente quando uma cobrança de curso é paga
 * 
 * @security Idempotência garantida por chargeId
 * @performance Processamento assíncrono via RabbitMQ
 */

import { DispatchWebhooks } from "../../application/useCases/DispatchWebhooks";
import { ProcessPixWebhook } from "../../application/useCases/ProcessPixWebhook";
import { MessagingFactory } from "../adapters/messaging/MessagingFactory";
import { EventHandler, RabbitMQConsumer } from "../adapters/messaging/RabbitMQConsumer";
import { FetchWebhookDeliveryAdapter } from "../adapters/webhooks/FetchWebhookDeliveryAdapter";
import { PrismaChargeRepository } from "../database/PrismaChargeRepository";
import { prisma } from "../database/prismaClient";
import { PrismaEnrollmentRepository } from "../database/repositories/PrismaEnrollmentRepository";
import { PrismaPaymentInteractionRepository } from "../database/repositories/PrismaPaymentInteractionRepository";
import { PrismaWebhookLogRepository } from "../database/repositories/PrismaWebhookLogRepository";
import { PrismaWebhookRepository } from "../database/repositories/PrismaWebhookRepository";
import { logger } from "../logger";

export class ChargePaidConsumer implements EventHandler {
  private processPixWebhook: ProcessPixWebhook;
  private chargeRepository: PrismaChargeRepository;
  private dispatchWebhooks: DispatchWebhooks;

  constructor() {
    const chargeRepository = new PrismaChargeRepository();
    const enrollmentRepository = new PrismaEnrollmentRepository();
    const paymentInteractionRepository = new PrismaPaymentInteractionRepository();
    const messaging = MessagingFactory.create();

    this.processPixWebhook = new ProcessPixWebhook(
      chargeRepository,
      enrollmentRepository,
      paymentInteractionRepository,
      messaging
    );

    const webhookRepository = new PrismaWebhookRepository(prisma);
    const webhookLogRepository = new PrismaWebhookLogRepository(prisma);
    const webhookDelivery = new FetchWebhookDeliveryAdapter();
    this.dispatchWebhooks = new DispatchWebhooks(
      webhookRepository,
      webhookLogRepository,
      webhookDelivery
    );

    this.chargeRepository = chargeRepository;
  }

  async handle(event: unknown): Promise<void> {
    try {
      const parsed = event as {
        traceId?: string;
        payload?: { chargeId?: string };
      };

      const chargeId = parsed.payload?.chargeId;
      if (!chargeId) {
        logger.warn({ event }, "charge.paid event without payload.chargeId");
        return;
      }

      const result = await this.processPixWebhook.execute({
        chargeId,
        traceId: parsed.traceId,
      });

      if (result.enrollmentCreated) {
        logger.info(
          {
            chargeId,
            enrollmentId: result.enrollmentId,
          },
          "Enrollment created from charge.paid event"
        );
      } else {
        logger.info(
          {
            chargeId,
          },
          "No enrollment created (not a course charge or already exists)"
        );
      }

      // Disparar webhooks do Turbofy para o integrador (não bloquear o processamento principal)
      try {
        const charge = await this.chargeRepository.findById(chargeId);
        if (!charge) {
          return;
        }

        const devMode = process.env.NODE_ENV !== "production";
        await this.dispatchWebhooks.execute({
          merchantId: charge.merchantId,
          event: "charge.paid",
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
            paidAt: charge.paidAt?.toISOString() ?? null,
          },
        });
      } catch (err) {
        logger.error(
          { err, chargeId },
          "Failed to dispatch webhooks for charge.paid (non-blocking)"
        );
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      logger.error(
        {
          error: errorMessage,
          event,
        },
        "Failed to process charge.paid event"
      );
      throw error;
    }
  }
}

/**
 * Inicializa o consumer de charge.paid
 */
export async function startChargePaidConsumer(): Promise<RabbitMQConsumer> {
  const consumer = new RabbitMQConsumer();
  const handler = new ChargePaidConsumer();

  consumer.registerHandler("charge.paid", handler);
  await consumer.start();

  logger.info("ChargePaidConsumer started");

  return consumer;
}

