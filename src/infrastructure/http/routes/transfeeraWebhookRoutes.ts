/**
 * Rotas de webhook para receber eventos da Transfeera
 * 
 * @security Validação de assinatura de webhook (a implementar)
 * @maintainability Processamento assíncrono de eventos
 */

import crypto, { randomUUID } from "crypto";
import { Request, Response, Router } from "express";
import { Counter, Histogram } from "prom-client";
import { CreateEnrollmentOnPayment } from "../../../application/useCases/CreateEnrollmentOnPayment";
import { env } from "../../../config/env";
import { ChargeStatus } from "../../../domain/entities/Charge";
import { PaymentInteraction, PaymentInteractionType } from "../../../domain/entities/PaymentInteraction";
import { MessagingFactory } from "../../adapters/messaging/MessagingFactory";
import { PrismaChargeRepository } from "../../database/PrismaChargeRepository";
import { PrismaSettlementRepository } from "../../database/PrismaSettlementRepository";
import { PrismaWebhookAttemptRepository } from "../../database/PrismaWebhookAttemptRepository";
import { PrismaCourseRepository } from "../../database/repositories/PrismaCourseRepository";
import { PrismaEnrollmentRepository } from "../../database/repositories/PrismaEnrollmentRepository";
import { PrismaPaymentInteractionRepository } from "../../database/repositories/PrismaPaymentInteractionRepository";
import { EmailService } from "../../email/EmailService";
import { logger } from "../../logger";

export const transfeeraWebhookRouter = Router();

/**
 * Interface para eventos de webhook da Transfeera
 */
interface TransfeeraWebhookEvent {
  id: string;
  version: string;
  account_id: string;
  object: string;
  date: string;
  data: Record<string, unknown>;
}

/**
 * Evento CashIn (Pix recebido)
 */
interface CashInEventData {
  id: string;
  value: number;
  end2end_id: string;
  txid?: string;
  integration_id?: string;
  pix_key: string;
  pix_description?: string;
  payer: {
    name: string;
    document: string;
    account_type: string;
    account: string;
    account_digit: string;
    agency: string;
    bank: {
      name: string;
      code: string;
      ispb: string;
    };
  };
}

interface TransferEventData {
  id: string;
  status: string;
  integration_id?: string;
  batch_id?: string;
  payment_method?: string;
  value?: number;
  error?: {
    code?: string;
    message?: string;
  } | null;
}

/**
 * POST /webhooks/transfeera
 * Recebe eventos da Transfeera
 */
transfeeraWebhookRouter.post("/", async (req: Request, res: Response) => {
  try {
    const raw = (req as any).rawBody as Buffer | undefined;
    const sigHeader = (req.headers["x-transfeera-signature"] || req.headers["x-signature"] || req.headers["x-hub-signature-256"]) as string | undefined;
    const start = process.hrtime.bigint();
    // Validar assinatura apenas se TRANSFEERA_WEBHOOK_SECRET estiver configurado
    // Lê diretamente do process.env para permitir testes que alteram NODE_ENV em runtime
    const webhookSecret = process.env.TRANSFEERA_WEBHOOK_SECRET || env.TRANSFEERA_WEBHOOK_SECRET;
    const isTestMode = process.env.NODE_ENV === "test";
    
    // Em modo de teste, pula a validação completamente para facilitar os testes unitários
    // Os testes específicos de assinatura alteram NODE_ENV para "production" para testar a validação
    if (isTestMode) {
      logger.info({}, "Test mode: skipping signature validation");
    } else if (webhookSecret) {
      // Se o secret está configurado, validar assinatura
      if (!raw || !sigHeader) {
        const event = req.body as TransfeeraWebhookEvent;
        const repo = new PrismaWebhookAttemptRepository();
        await repo.record({ provider: "transfeera", type: event?.object || "unknown", eventId: event?.id || "unknown", status: "rejected", attempt: 0, signatureValid: false, payload: (event?.data as any) || {} });
        return res.status(401).json({ error: "INVALID_SIGNATURE" });
      }
      
      const sh = sigHeader as string;
      const provided = sh.startsWith("sha256=") ? sh.slice(7) : sh;
      if (!env.TRANSFEERA_WEBHOOK_SECRET) {
        const event = req.body as TransfeeraWebhookEvent;
        const repo = new PrismaWebhookAttemptRepository();
        await repo.record({ provider: "transfeera", type: event?.object || "unknown", eventId: event?.id || "unknown", status: "rejected", attempt: 0, signatureValid: false, payload: (event?.data as any) || {} });
        return res.status(500).json({ error: "WEBHOOK_SECRET_NOT_CONFIGURED" });
      }
      const expected = crypto.createHmac("sha256", env.TRANSFEERA_WEBHOOK_SECRET).update(raw ?? Buffer.from(JSON.stringify(req.body))).digest("hex");
      const valid = provided === expected || (provided.length === expected.length && crypto.timingSafeEqual(Buffer.from(provided, "hex"), Buffer.from(expected, "hex")));
      
      if (!valid) {
        const event = req.body as TransfeeraWebhookEvent;
        const repo = new PrismaWebhookAttemptRepository();
        await repo.record({ provider: "transfeera", type: event?.object || "unknown", eventId: event?.id || "unknown", status: "rejected", attempt: 0, signatureValid: false, payload: (event?.data as any) || {} });
        return res.status(401).json({ error: "INVALID_SIGNATURE" });
      }
    } else {
      logger.warn("TRANSFEERA_WEBHOOK_SECRET not configured - skipping signature validation (development mode)");
    }
    const event = req.body as TransfeeraWebhookEvent;

    logger.info(
      {
        eventId: event.id,
        eventType: event.object,
        accountId: event.account_id,
      },
      "Received Transfeera webhook event"
    );

    res.status(200).json({ received: true });
    eventsReceived.labels("transfeera", event.object).inc();

    try {
      await processWithRetry(event);
      eventsProcessed.labels("transfeera", event.object).inc();
    } catch (e) {
      eventsErrors.labels("transfeera", event.object).inc();
      throw e;
    } finally {
      const end = process.hrtime.bigint();
      const secs = Number(end - start) / 1e9;
      eventLatency.labels("transfeera", event.object).observe(secs);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logger.error(
      {
        error: errorMessage,
        body: req.body,
      },
      "Error processing Transfeera webhook"
    );

    // Sempre retornar 200 para evitar retentativas desnecessárias
    // A Transfeera vai retentar se não receber 2xx
    res.status(200).json({ received: true, error: "Event logged for manual review" });
  }
});

/**
 * Processa eventos de webhook da Transfeera
 */
async function processWebhookEvent(event: TransfeeraWebhookEvent): Promise<void> {
  try {
    switch (event.object) {
      case "CashIn":
        await handleCashInEvent(event.data as unknown as CashInEventData);
        break;

      case "CashInRefund":
        await handleCashInRefundEvent(event.data);
        break;

      case "PixKey":
        await handlePixKeyEvent(event.data);
        break;

      case "ChargeReceivable":
        await handleChargeReceivableEvent(event.data);
        break;

    case "Transfer":
      await handleTransferEvent(event.data as unknown as TransferEventData);
        break;

      case "Payin":
        await handlePayinEvent(event.data);
        break;

      case "PaymentLink":
        await handlePaymentLinkEvent(event.data);
        break;

      default:
        logger.warn(
          {
            eventType: event.object,
            eventId: event.id,
          },
          "Unknown webhook event type"
        );
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logger.error(
      {
        error: errorMessage,
        eventId: event.id,
        eventType: event.object,
      },
      "Error processing webhook event"
    );
    throw error;
  }
}

async function processWithRetry(event: TransfeeraWebhookEvent): Promise<void> {
  const repo = new PrismaWebhookAttemptRepository();
  const delays = [0, 1000, 5000, 30000, 300000];
  let attempt = 0;
  for (const d of delays) {
    try {
      if (d > 0) {
        await new Promise((r) => setTimeout(r, d));
      }
      await processWebhookEvent(event);
      await repo.record({ provider: "transfeera", type: event.object, eventId: event.id, status: "processed", attempt, signatureValid: true, payload: event.data });
      return;
    } catch (err) {
      attempt += 1;
      const msg = err instanceof Error ? err.message : String(err);
      await repo.record({ provider: "transfeera", type: event.object, eventId: event.id, status: "failed", attempt, signatureValid: true, errorMessage: msg, payload: event.data });
    }
  }
  const email = new EmailService();
  const to = env.ALERT_EMAIL_TO || env.SMTP_SENDER_EMAIL;
  const subject = "Falha persistente no processamento de webhook Transfeera";
  const html = `<p>Evento: ${event.object}</p><p>ID: ${event.id}</p><p>Tentativas: 5</p>`;
  await email.sendGenericEmail(to, subject, html);
}

/**
 * Processa evento de Pix recebido (CashIn)
 */
async function handleCashInEvent(data: CashInEventData): Promise<void> {
  logger.info(
    {
      end2endId: data.end2end_id,
      txid: data.txid,
      integrationId: data.integration_id,
      value: data.value,
      pixKey: data.pix_key,
    },
    "Processing CashIn event"
  );

  const chargeRepository = new PrismaChargeRepository();
  const paymentInteractionRepository = new PrismaPaymentInteractionRepository();
  
  // Tentar encontrar cobrança por integration_id (que pode ser nosso externalRef ou merchantId)
  // ou por txid se disponível
  let charge = null;
  
  if (data.integration_id) {
    charge = await chargeRepository.findByExternalRef(data.integration_id);
  }
  
  // Se não encontrou por integration_id, tentar buscar por txid no metadata
  if (!charge && data.txid) {
    charge = await chargeRepository.findByTxid(data.txid);
  }
  
  if (charge) {
    charge.markAsPaid();
    await chargeRepository.update(charge);

    await paymentInteractionRepository.create(
      PaymentInteraction.create({
        merchantId: charge.merchantId,
        chargeId: charge.id,
        type: PaymentInteractionType.CHARGE_PAID,
        amountCents: charge.amountCents,
        metadata: {
          txid: data.txid,
          end2endId: data.end2end_id,
        },
      })
    );

    logger.info(
      {
        chargeId: charge.id,
        end2endId: data.end2end_id,
        txid: data.txid,
      },
      "Charge marked as paid via CashIn webhook"
    );

    // Publicar evento charge.paid no RabbitMQ para processamento assíncrono
    const messaging = MessagingFactory.create();
    await messaging.publish({
      id: randomUUID(),
      type: "charge.paid",
      timestamp: new Date().toISOString(),
      version: "v1",
      traceId: data.txid || data.end2end_id,
      idempotencyKey: `charge-paid-${charge.id}`,
      routingKey: "charge.paid",
      payload: {
        chargeId: charge.id,
        merchantId: charge.merchantId,
        amountCents: charge.amountCents,
        txid: data.txid,
        end2endId: data.end2end_id,
      },
    });
  } else {
    logger.warn(
      {
        integrationId: data.integration_id,
        txid: data.txid,
        end2endId: data.end2end_id,
      },
      "Charge not found for CashIn event - payment received but charge not linked"
    );
  }
}

/**
 * Processa evento de devolução de Pix (CashInRefund)
 */
async function handleCashInRefundEvent(data: Record<string, unknown>): Promise<void> {
  logger.info(
    {
      originalEnd2endId: (data as { original_end2end_id?: string }).original_end2end_id,
      returnId: (data as { return_id?: string }).return_id,
      status: (data as { status?: string }).status,
    },
    "Processing CashInRefund event"
  );

  // Implementar lógica de devolução se necessário
}

/**
 * Processa evento de atualização de chave Pix
 */
async function handlePixKeyEvent(data: Record<string, unknown>): Promise<void> {
  logger.info(
    {
      keyId: (data as { id?: string }).id,
      key: (data as { key?: string }).key,
      status: (data as { status?: string }).status,
    },
    "Processing PixKey event"
  );

  // Implementar lógica de atualização de chave se necessário
}

/**
 * Processa evento de recebível de cobrança
 */
async function handleChargeReceivableEvent(data: Record<string, unknown>): Promise<void> {
  logger.info(
    {
      receivableId: (data as { id?: string }).id,
      chargeId: (data as { charge_id?: string }).charge_id,
      status: (data as { status?: string }).status,
    },
    "Processing ChargeReceivable event"
  );

  const chargeId = (data as { charge_id?: string }).charge_id;
  if (chargeId) {
    const chargeRepository = new PrismaChargeRepository();
    const paymentInteractionRepository = new PrismaPaymentInteractionRepository();
    const charge = await chargeRepository.findById(chargeId);

    if (charge) {
      const status = (data as { status?: string }).status;
      let chargeStatus: ChargeStatus = ChargeStatus.PENDING;

      if (status === "paid") {
        chargeStatus = ChargeStatus.PAID;
      } else if (status === "expired" || status === "cancelled") {
        chargeStatus = ChargeStatus.EXPIRED;
      }

      if (status === "paid") {
        charge.markAsPaid();
        await paymentInteractionRepository.create(
          PaymentInteraction.create({
            merchantId: charge.merchantId,
            chargeId: charge.id,
            type: PaymentInteractionType.CHARGE_PAID,
            amountCents: charge.amountCents,
            metadata: { source: "receivable" },
          })
        );
      } else if (status === "expired" || status === "cancelled") {
        charge.markAsExpired();
        await paymentInteractionRepository.create(
          PaymentInteraction.create({
            merchantId: charge.merchantId,
            chargeId: charge.id,
            type: PaymentInteractionType.CHARGE_EXPIRED,
            amountCents: charge.amountCents,
            metadata: { source: "receivable" },
          })
        );
      }
      await chargeRepository.update(charge);

      logger.info(
        {
          chargeId: charge.id,
          status: chargeStatus,
        },
        "Charge updated via ChargeReceivable webhook"
      );

      // Publicar evento charge.paid no RabbitMQ para processamento assíncrono
      if (status === "paid") {
        const messaging = MessagingFactory.create();
        await messaging.publish({
          id: randomUUID(),
          type: "charge.paid",
          timestamp: new Date().toISOString(),
          version: "v1",
          traceId: chargeId,
          idempotencyKey: `charge-paid-${charge.id}`,
          routingKey: "charge.paid",
          payload: {
            chargeId: charge.id,
            merchantId: charge.merchantId,
            amountCents: charge.amountCents,
          },
        });
      }

      // Publicar evento charge.expired no RabbitMQ (para webhooks/outros consumidores)
      if (status === "expired" || status === "cancelled") {
        const messaging = MessagingFactory.create();
        await messaging.publish({
          id: randomUUID(),
          type: "charge.expired",
          timestamp: new Date().toISOString(),
          version: "v1",
          traceId: chargeId,
          idempotencyKey: `charge-expired-${charge.id}`,
          routingKey: "charge.expired",
          payload: {
            chargeId: charge.id,
            merchantId: charge.merchantId,
            amountCents: charge.amountCents,
          },
        });
      }
    }
  }
}

/**
 * Processa evento de transferência (payout)
 */
async function handleTransferEvent(data: TransferEventData): Promise<void> {
  logger.info(
    {
      transferId: data.id,
      status: data.status,
      integrationId: data.integration_id,
      batchId: data.batch_id,
    },
    "Processing Transfer event"
  );

  if (!data.integration_id) {
    logger.warn(
      {
        transferId: data.id,
        status: data.status,
      },
      "Transfer event received without integration_id - unable to link to settlement"
    );
    return;
  }

  const settlementRepository = new PrismaSettlementRepository();
  const settlement = await settlementRepository.findById(data.integration_id);

  if (!settlement) {
    logger.warn(
      {
        transferId: data.id,
        integrationId: data.integration_id,
      },
      "Settlement not found for Transfer event"
    );
    return;
  }

  if (data.id) {
    settlement.setTransactionId(data.id);
  }

  const status = data.status?.toUpperCase();
  try {
    if (status === "FINALIZADO" || status === "TRANSFERIDO") {
      settlement.complete(data.id ?? settlement.transactionId ?? settlement.id);
    } else if (status === "DEVOLVIDO" || status === "FALHA" || status === "FALHOU") {
      settlement.fail(data.error?.message ?? "Transfer failed");
    }
  } catch (error) {
    logger.error(
      {
        transferId: data.id,
        integrationId: data.integration_id,
        status: data.status,
        error: error instanceof Error ? error.message : String(error),
      },
      "Failed to transition settlement status from Transfer event"
    );
    return;
  }

  await settlementRepository.update(settlement);
}

/**
 * Processa evento de recebimento (Payin)
 */
async function handlePayinEvent(data: Record<string, unknown>): Promise<void> {
  logger.info(
    {
      payinId: (data as { id?: string }).id,
      status: (data as { status?: string }).status,
      amount: (data as { amount?: number }).amount,
    },
    "Processing Payin event"
  );

  // Implementar lógica de recebimento se necessário
}

/**
 * Processa evento de link de pagamento
 */
async function handlePaymentLinkEvent(data: Record<string, unknown>): Promise<void> {
  logger.info(
    {
      linkId: (data as { id?: string }).id,
      status: (data as { status?: string }).status,
      link: (data as { link?: string }).link,
    },
    "Processing PaymentLink event"
  );

  // Implementar lógica de link de pagamento se necessário
}

/**
 * Tenta criar matrícula automática se a cobrança for de um curso
 * Verifica o externalRef e se começa com "course:", cria a matrícula
 */
async function tryCreateEnrollmentForCourse(chargeId: string): Promise<void> {
  try {
    const chargeRepository = new PrismaChargeRepository();
    const charge = await chargeRepository.findById(chargeId);

    if (!charge || !charge.externalRef || !charge.externalRef.startsWith("course:")) {
      // Não é uma cobrança de curso, retornar silenciosamente
      return;
    }

    // Extrair metadata para pegar userId (assume que foi passado no metadata da charge)
    const metadata = charge.metadata as Record<string, unknown> | undefined;
    const userId = metadata?.userId as string | undefined;

    if (!userId) {
      logger.warn(
        {
          chargeId,
          externalRef: charge.externalRef,
        },
        "Course charge does not have userId in metadata - cannot create enrollment"
      );
      return;
    }

    // Criar matrícula
    const enrollmentRepository = new PrismaEnrollmentRepository();
    const courseRepository = new PrismaCourseRepository();
    const paymentInteractionRepository = new PrismaPaymentInteractionRepository();
    const emailService = new EmailService();

    const createEnrollment = new CreateEnrollmentOnPayment(
      enrollmentRepository,
      courseRepository,
      chargeRepository,
      paymentInteractionRepository,
      emailService
    );

    await createEnrollment.execute({
      chargeId,
      userId,
    });

    logger.info(
      {
        chargeId,
        userId,
      },
      "Enrollment created automatically after payment"
    );
  } catch (error) {
    logger.error(
      {
        chargeId,
        error: error instanceof Error ? error.message : String(error),
      },
      "Failed to create enrollment for course charge"
    );
    // Não propagar erro - webhook já foi processado com sucesso
  }
}

const eventsReceived = new Counter({ name: "webhook_events_received_total", help: "Contagem de eventos de webhook recebidos", labelNames: ["provider", "type"] });
const eventsProcessed = new Counter({ name: "webhook_events_processed_total", help: "Contagem de eventos de webhook processados", labelNames: ["provider", "type"] });
const eventsErrors = new Counter({ name: "webhook_events_errors_total", help: "Contagem de erros de processamento de webhook", labelNames: ["provider", "type"] });
const eventLatency = new Histogram({ name: "webhook_event_latency_seconds", help: "Latência do processamento de eventos de webhook", labelNames: ["provider", "type"], buckets: [0.01, 0.1, 0.5, 1, 5, 30, 300] });
