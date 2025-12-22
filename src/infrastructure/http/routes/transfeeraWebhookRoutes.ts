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
import { prisma } from "../../database/prismaClient";
import { PrismaSettlementRepository } from "../../database/PrismaSettlementRepository";
import { PrismaWebhookAttemptRepository } from "../../database/PrismaWebhookAttemptRepository";
import { PrismaCourseRepository } from "../../database/repositories/PrismaCourseRepository";
import { PrismaEnrollmentRepository } from "../../database/repositories/PrismaEnrollmentRepository";
import { PrismaPaymentInteractionRepository } from "../../database/repositories/PrismaPaymentInteractionRepository";
import { PrismaTransfeeraWebhookConfigRepository } from "../../database/repositories/PrismaTransfeeraWebhookConfigRepository";
import { EmailService } from "../../email/EmailService";
import { logger } from "../../logger";

export const transfeeraWebhookRouter = Router();

/**
 * GET /webhooks/transfeera
 * Endpoint para testes da Transfeera (ela pode testar com GET antes de criar o webhook)
 */
transfeeraWebhookRouter.get("/", async (req: Request, res: Response) => {
  logger.info(
    {
      method: "GET",
      userAgent: req.headers["user-agent"],
      ip: req.ip,
      tip: "Requisição GET recebida - provavelmente teste da Transfeera",
    },
    "Transfeera webhook GET test request"
  );
  res.status(200).json({ 
    status: "ok", 
    message: "Webhook endpoint is accessible",
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /webhooks/transfeera/health
 * Endpoint de diagnóstico para verificar se o webhook está acessível
 */
transfeeraWebhookRouter.get("/health", async (_req: Request, res: Response) => {
  res.status(200).json({ 
    status: "ok", 
    message: "Turbofy Transfeera Webhook Endpoint",
    timestamp: new Date().toISOString(),
    version: "v1",
    expectedHeaders: ["Transfeera-Signature"],
    signatureFormat: "t=<timestamp>,v1=<hmac_sha256>",
  });
});

/**
 * GET /webhooks/transfeera/status
 * Endpoint para verificar a configuração de webhooks da Transfeera
 * (requer autenticação - apenas para diagnóstico)
 */
transfeeraWebhookRouter.get("/status", async (req: Request, res: Response) => {
  try {
    const webhookConfigRepo = new PrismaTransfeeraWebhookConfigRepository();
    const attemptRepo = new PrismaWebhookAttemptRepository();
    
    // Buscar últimas tentativas de webhook
    const recentAttempts = await prisma.webhookAttempt.findMany({
      where: { provider: "transfeera" },
      orderBy: { createdAt: "desc" },
      take: 10,
    });
    
    // Buscar configurações de webhook
    const configs = await prisma.transfeeraWebhookConfig.findMany({
      select: {
        id: true,
        merchantId: true,
        webhookId: true,
        accountId: true,
        url: true,
        objectTypes: true,
        active: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    });
    
    res.status(200).json({
      status: "ok",
      timestamp: new Date().toISOString(),
      configs: configs.map(c => ({
        ...c,
        hasSecret: true, // Não expor o secret
      })),
      recentAttempts: recentAttempts.map(a => ({
        id: a.id,
        eventId: a.eventId,
        type: a.type,
        status: a.status,
        signatureValid: a.signatureValid,
        errorMessage: a.errorMessage,
        createdAt: a.createdAt,
      })),
      tips: [
        "Certifique-se de que a URL do webhook na Transfeera está correta",
        "O header 'Transfeera-Signature' deve estar presente em todas as requisições",
        "O account_id do evento deve corresponder a um webhook configurado",
      ],
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: "INTERNAL_ERROR", message: errorMessage });
  }
});

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
  const start = process.hrtime.bigint();
  const raw = (req as any).rawBody as Buffer | undefined;
  
  // IMPORTANTE: A Transfeera envia o header "Transfeera-Signature" (sem prefixo x-)
  // Express.js converte automaticamente para lowercase: "transfeera-signature"
  // Também verificamos variantes para compatibilidade
  const sigHeader = (
    req.headers["transfeera-signature"] || // Header oficial da Transfeera (lowercase)
    req.headers["x-transfeera-signature"] || // Possível variante com prefixo x-
    req.headers["x-signature"] || // Fallback genérico
    req.headers["x-hub-signature-256"] // Fallback para outros provedores
  ) as string | undefined;
  
  const event = req.body as TransfeeraWebhookEvent;
  
  // Log inicial para debug - captura TODAS as tentativas de webhook
  // Incluir todos os headers para diagnóstico
  logger.info(
    {
      hasBody: !!req.body,
      hasRawBody: !!raw,
      rawBodyLength: raw ? raw.length : 0,
      hasSignature: !!sigHeader,
      signatureHeader: sigHeader ? sigHeader.substring(0, 50) + "..." : "missing",
      allHeaders: Object.keys(req.headers).filter(h => h.includes("signature") || h.includes("transfeera")),
      bodyKeys: req.body ? Object.keys(req.body) : [],
      eventId: event?.id,
      eventType: event?.object,
      accountId: event?.account_id,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    },
    "Webhook Transfeera received (before validation)"
  );

  try {
    const isTestMode = process.env.NODE_ENV === "test";
    const webhookConfigRepo = new PrismaTransfeeraWebhookConfigRepository();
    const attemptRepo = new PrismaWebhookAttemptRepository();
    
    // Detectar se é um teste da Transfeera (quando ela testa a URL antes de criar o webhook)
    // A Transfeera envia uma requisição sem assinatura para testar se a URL está acessível
    // Critérios para detectar teste:
    // 1. Não tem assinatura E (não tem body válido OU não tem event.id OU não tem account_id)
    // 2. User-Agent contém "transfeera"
    // 3. Body vazio ou inválido
    const userAgent = req.headers["user-agent"] || "";
    const isTransfeeraUserAgent = userAgent.toLowerCase().includes("transfeera");
    const hasValidEvent = event && event.id && event.account_id;
    const hasEmptyBody = !req.body || Object.keys(req.body).length === 0;
    const isTransfeeraTest = !sigHeader && (!hasValidEvent || hasEmptyBody);
    
    // Em modo de teste ou teste da Transfeera, aceitar sem validação
    if (isTestMode || isTransfeeraTest || isTransfeeraUserAgent) {
      if (isTransfeeraTest || isTransfeeraUserAgent) {
        logger.info(
          {
            userAgent,
            ip: req.ip,
            hasBody: !!req.body,
            bodyKeys: req.body ? Object.keys(req.body) : [],
            hasSignature: !!sigHeader,
            eventId: event?.id,
            accountId: event?.account_id,
            hasValidEvent,
            hasEmptyBody,
            isTransfeeraTest,
            isTransfeeraUserAgent,
            tip: "Esta é uma requisição de teste da Transfeera. Retornando 200 para permitir criação do webhook.",
          },
          "Transfeera webhook test request - accepting without signature"
        );
        // Retornar 200 para permitir que a Transfeera crie o webhook
        return res.status(200).json({ 
          status: "ok", 
          message: "Webhook endpoint is accessible",
          timestamp: new Date().toISOString(),
        });
      }
      logger.info({}, "Test mode: skipping signature validation");
    } else {
      // Se o secret está configurado no banco, validar assinatura
      // Mas primeiro, verificar novamente se não é um teste (pode ter sido detectado incorretamente)
      if (!raw || !sigHeader) {
        // Última verificação: se não tem assinatura e não tem evento válido, pode ser teste
        const mightBeTest = !hasValidEvent || hasEmptyBody;
        if (mightBeTest) {
          logger.info(
            {
              hasRaw: !!raw,
              rawLength: raw ? raw.length : 0,
              hasSigHeader: !!sigHeader,
              eventId: event?.id,
              accountId: event?.account_id,
              tip: "Sem assinatura e sem evento válido - tratando como teste da Transfeera",
            },
            "Transfeera webhook test request (fallback detection) - accepting without signature"
          );
          return res.status(200).json({ 
            status: "ok", 
            message: "Webhook endpoint is accessible",
            timestamp: new Date().toISOString(),
          });
        }
        
        logger.warn(
          {
            hasRaw: !!raw,
            rawLength: raw ? raw.length : 0,
            hasSigHeader: !!sigHeader,
            eventId: event?.id,
            eventType: event?.object,
            accountId: event?.account_id,
            allSignatureHeaders: Object.entries(req.headers)
              .filter(([k]) => k.toLowerCase().includes("signature"))
              .map(([k, v]) => `${k}: ${String(v).substring(0, 20)}...`),
            tip: "Verifique se a Transfeera está enviando o header 'Transfeera-Signature' e se o middleware express.raw() está antes de express.json()",
          },
          "Webhook rejected: missing raw body or signature header"
        );
        await attemptRepo.record({ provider: "transfeera", type: event?.object || "unknown", eventId: event?.id || "unknown", status: "rejected", attempt: 0, signatureValid: false, payload: (event?.data as any) || {} });
        return res.status(401).json({ error: "INVALID_SIGNATURE", details: "Missing raw body or signature header" });
      }

      const config = await webhookConfigRepo.findByAccountId(event.account_id);
      if (!config) {
        logger.warn(
          {
            accountId: event.account_id,
            eventId: event?.id,
            eventType: event?.object,
            tip: "O account_id do evento não corresponde a nenhum webhook configurado. Verifique se o webhook foi registrado corretamente na Transfeera.",
          },
          "Webhook rejected: webhook not configured for account"
        );
        await attemptRepo.record({ provider: "transfeera", type: event?.object || "unknown", eventId: event?.id || "unknown", status: "rejected", attempt: 0, signatureValid: false, payload: (event?.data as any) || {} });
        return res.status(401).json({ error: "WEBHOOK_NOT_CONFIGURED", details: `No webhook configured for account_id: ${event.account_id}` });
      }

      const secret = await webhookConfigRepo.getSignatureSecret(config.webhookId);
      if (!secret) {
        await attemptRepo.record({ provider: "transfeera", type: event?.object || "unknown", eventId: event?.id || "unknown", status: "rejected", attempt: 0, signatureValid: false, payload: (event?.data as any) || {} });
        return res.status(500).json({ error: "WEBHOOK_SECRET_NOT_CONFIGURED" });
      }

      const rawPayload = raw ? raw.toString("utf8") : JSON.stringify(req.body);
      const signatureHeader = sigHeader as string;

      // Formato esperado: t=timestamp,v1=signature
      let provided = "";
      let timestamp = "";
      if (signatureHeader.includes("t=") && signatureHeader.includes("v1=")) {
        const parts = signatureHeader.split(",").map((p) => p.trim());
        for (const part of parts) {
          const [k, v] = part.split("=");
          if (k === "t") timestamp = v;
          if (k === "v1") provided = v;
        }
      } else {
        provided = signatureHeader.startsWith("sha256=") ? signatureHeader.slice(7) : signatureHeader;
      }

      if (!provided) {
        await attemptRepo.record({ provider: "transfeera", type: event?.object || "unknown", eventId: event?.id || "unknown", status: "rejected", attempt: 0, signatureValid: false, payload: (event?.data as any) || {} });
        return res.status(401).json({ error: "INVALID_SIGNATURE" });
      }

      const message = timestamp ? `${timestamp}.${rawPayload}` : rawPayload;
      const expected = crypto.createHmac("sha256", secret).update(message).digest("hex");
      const valid = provided === expected || (provided.length === expected.length && crypto.timingSafeEqual(Buffer.from(provided, "hex"), Buffer.from(expected, "hex")));

      if (!valid) {
        logger.warn(
          {
            eventId: event?.id,
            eventType: event?.object,
            accountId: event.account_id,
            signatureLength: provided.length,
            expectedLength: expected.length,
            signatureMatch: provided === expected,
            providedPrefix: provided.substring(0, 10),
            expectedPrefix: expected.substring(0, 10),
            timestamp: timestamp,
            payloadLength: rawPayload.length,
            tip: "A assinatura não corresponde. Verifique se o secret está correto e se o payload não foi modificado.",
          },
          "Webhook rejected: invalid signature"
        );
        await attemptRepo.record({ provider: "transfeera", type: event?.object || "unknown", eventId: event?.id || "unknown", status: "rejected", attempt: 0, signatureValid: false, payload: (event?.data as any) || {} });
        return res.status(401).json({ error: "INVALID_SIGNATURE", details: "Signature mismatch" });
      }
    }

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
  
  // Estratégia de matching melhorada:
  // 1. Tentar por txid primeiro (mais confiável, único por cobrança)
  // 2. Se não encontrar, tentar por externalRef (se o integrador passou)
  // 3. Se ainda não encontrar, tentar buscar charges recentes do merchantId e fazer matching por valor
  let charge = null;
  
  // 1. Tentar por txid primeiro (mais confiável)
  if (data.txid) {
    charge = await chargeRepository.findByTxid(data.txid);
    if (charge) {
      logger.info(
        {
          chargeId: charge.id,
          txid: data.txid,
        },
        "Charge found by txid"
      );
    }
  }
  
  // 2. Se não encontrou por txid, tentar por externalRef (integration_id pode ser externalRef)
  if (!charge && data.integration_id) {
    charge = await chargeRepository.findByExternalRef(data.integration_id);
    if (charge) {
      logger.info(
        {
          chargeId: charge.id,
          integrationId: data.integration_id,
        },
        "Charge found by externalRef (integration_id)"
      );
    }
  }
  
  // 3. Fallback: buscar charges recentes do merchantId e fazer matching por valor
  // Isso é necessário porque a Transfeera pode enviar integration_id = merchantId
  // quando o integrador não passou externalRef
  if (!charge && data.integration_id && data.value) {
    const amountCents = Math.round(data.value * 100); // Converter reais para centavos
    const recentCharges = await prisma.charge.findMany({
      where: {
        merchantId: data.integration_id, // Pode ser merchantId se não for externalRef
        amountCents,
        status: "PENDING",
        method: "PIX",
        createdAt: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Últimos 7 dias
        },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    });
    
    // Se encontrou apenas uma charge com valor exato, usar ela
    if (recentCharges.length === 1) {
      charge = await chargeRepository.findById(recentCharges[0].id);
      if (charge) {
        logger.info(
          {
            chargeId: charge.id,
            integrationId: data.integration_id,
            amountCents,
          },
          "Charge found by merchantId + amountCents fallback"
        );
      }
    } else if (recentCharges.length > 1) {
      logger.warn(
        {
          integrationId: data.integration_id,
          amountCents,
          foundCount: recentCharges.length,
        },
        "Multiple charges found with same merchantId and amount - cannot auto-match"
      );
    }
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
