import { Request, Response } from "express";
import { z } from "zod";
import { HandleTransfeeraWebhookUseCase } from "../../../application/useCases/webhook/HandleTransfeeraWebhookUseCase";
import { PrismaWithdrawalRepository } from "../../database/PrismaWithdrawalRepository";
import { PrismaUserLedgerRepository } from "../../database/PrismaUserLedgerRepository";
import { logger } from "../../logger";
import crypto from "crypto";

const withdrawalRepository = new PrismaWithdrawalRepository();
const ledgerRepository = new PrismaUserLedgerRepository();
const handleWebhook = new HandleTransfeeraWebhookUseCase(
  withdrawalRepository,
  ledgerRepository
);

const transferaWebhookSchema = z.object({
  event: z.string(),
  data: z.object({
    id: z.string(),
    status: z.string(),
    integration_id: z.string().optional(),
    batch_id: z.string().optional(),
  }),
});

/**
 * Valida assinatura do webhook da Transfeera
 * Formato: turbofy-signature: t=<timestamp_ms>,v1=<hex_hmac_sha256>
 */
const validateWebhookSignature = (
  rawBody: string,
  signature: string | undefined,
  secret: string
): boolean => {
  if (!signature) {
    return false;
  }

  try {
    // Parsear header: t=1234567890,v1=abcdef...
    const parts = signature.split(",");
    const timestampPart = parts.find((p) => p.startsWith("t="));
    const signaturePart = parts.find((p) => p.startsWith("v1="));

    if (!timestampPart || !signaturePart) {
      logger.warn("Invalid signature format");
      return false;
    }

    const timestamp = timestampPart.substring(2);
    const expectedSignature = signaturePart.substring(3);

    // Verificar timestamp (não aceitar webhooks com mais de 5 minutos)
    const timestampMs = parseInt(timestamp, 10);
    const now = Date.now();
    const fiveMinutesMs = 5 * 60 * 1000;

    if (Math.abs(now - timestampMs) > fiveMinutesMs) {
      logger.warn({ timestamp, now }, "Webhook timestamp too old or in the future");
      return false;
    }

    // Calcular HMAC
    const signedPayload = `${timestamp}.${rawBody}`;
    const hmac = crypto
      .createHmac("sha256", secret)
      .update(signedPayload)
      .digest("hex");

    // Comparação timing-safe
    return crypto.timingSafeEqual(
      Buffer.from(hmac, "hex"),
      Buffer.from(expectedSignature, "hex")
    );
  } catch (error) {
    logger.error({ error }, "Error validating webhook signature");
    return false;
  }
};

export class WebhookController {
  async handleTransfeeraWebhook(req: Request, res: Response) {
    try {
      const rawBody = JSON.stringify(req.body);
      const signature = req.headers["turbofy-signature"] as string | undefined;
      const webhookSecret = process.env.TRANSFEERA_WEBHOOK_SECRET;

      logger.info(
        {
          event: req.body.event,
          hasSignature: !!signature,
        },
        "Received Transfeera webhook"
      );

      // Validar assinatura (se configurado)
      if (webhookSecret) {
        const isValid = validateWebhookSignature(rawBody, signature, webhookSecret);

        if (!isValid) {
          logger.warn(
            { signature, body: req.body },
            "Invalid webhook signature"
          );
          return res.status(401).json({
            error: "INVALID_SIGNATURE",
            message: "Webhook signature validation failed",
          });
        }
      } else {
        logger.warn("TRANSFEERA_WEBHOOK_SECRET not configured, skipping signature validation");
      }

      // Validar payload
      const payload = transferaWebhookSchema.parse(req.body);

      logger.info(
        {
          event: payload.event,
          transferId: payload.data.id,
          status: payload.data.status,
        },
        "Processing Transfeera webhook"
      );

      // Processar webhook
      await handleWebhook.execute({
        transferId: payload.data.id,
        status: payload.data.status,
        eventType: payload.event,
        metadata: {
          integrationId: payload.data.integration_id,
          batchId: payload.data.batch_id,
        },
      });

      logger.info(
        { event: payload.event, transferId: payload.data.id },
        "Webhook processed successfully"
      );

      // Responder 200 OK para Transfeera
      return res.status(200).json({ received: true });
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : "Unknown error",
          stack: error instanceof Error ? error.stack : undefined,
          body: req.body,
        },
        "Error processing Transfeera webhook"
      );

      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: "VALIDATION_ERROR",
          message: "Invalid webhook payload",
          details: error.issues,
        });
      }

      // Retornar 500 para que Transfeera tente novamente
      return res.status(500).json({
        error: "INTERNAL_SERVER_ERROR",
        message: "Error processing webhook",
      });
    }
  }
}

