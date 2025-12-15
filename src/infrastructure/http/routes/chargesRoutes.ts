import { Router, Request, Response } from "express";
import { CreateChargeRequestSchema, CreateChargeResponseSchema } from "../schemas/charges";
import { ZodError } from "zod";
import { PrismaChargeRepository } from "../../database/PrismaChargeRepository";
import { PaymentProviderFactory } from "../../adapters/payment/PaymentProviderFactory";
import { MessagingFactory } from "../../adapters/messaging/MessagingFactory";
import { CreateCharge } from "../../../application/useCases/CreateCharge";
import { logger } from "../../logger";
import { ChargeMethod } from "../../../domain/entities/Charge";
import { PrismaPaymentInteractionRepository } from "../../database/repositories/PrismaPaymentInteractionRepository";

export const chargesRouter = Router();

// Middleware de idempotência
chargesRouter.use((req, res, next) => {
  const idemKey = req.header("X-Idempotency-Key");
  if (!idemKey) {
    return res.status(400).json({ error: { code: "IDEMPOTENCY_KEY_MISSING", message: "Header X-Idempotency-Key é obrigatório" } });
  }
  next();
});

chargesRouter.post("/", async (req: Request, res: Response) => {
  try {
    const parsed = CreateChargeRequestSchema.parse(req.body);

    // Cria instâncias dos adapters (em produção usar DI/container)
    const chargeRepository = new PrismaChargeRepository();
    const paymentProvider = PaymentProviderFactory.create();
    const messaging = MessagingFactory.create();
    const paymentInteractionRepository = new PrismaPaymentInteractionRepository();

    const useCase = new CreateCharge(
      chargeRepository,
      paymentProvider,
      messaging,
      paymentInteractionRepository
    );

    // With nativeEnum, parsed.method is already a ChargeMethod
    const methodEnum: ChargeMethod | undefined = parsed.method;

    const result = await useCase.execute({
      idempotencyKey: req.header("X-Idempotency-Key") as string,
      merchantId: parsed.merchantId,
      initiatorUserId: req.user?.id,
      amountCents: parsed.amountCents,
      currency: parsed.currency,
      description: parsed.description,
      method: methodEnum,
      expiresAt: parsed.expiresAt ? new Date(parsed.expiresAt) : undefined,
      externalRef: parsed.externalRef,
      metadata: parsed.metadata,
      splits: parsed.splits,
      fees: parsed.fees,
    });

    const { charge, splits, fees } = result;

    const responseData: Record<string, unknown> = {
      id: charge.id,
      merchantId: charge.merchantId,
      amountCents: charge.amountCents,
      currency: charge.currency,
      description: charge.description ?? null,
      status: charge.status,
      method: charge.method ?? null,
      expiresAt: charge.expiresAt ? charge.expiresAt.toISOString() : null,
      idempotencyKey: charge.idempotencyKey,
      externalRef: charge.externalRef ?? null,
      metadata: charge.metadata ?? null,
      pix: charge.pixQrCode ? { qrCode: charge.pixQrCode, copyPaste: charge.pixCopyPaste!, expiresAt: (charge.expiresAt ?? new Date()).toISOString() } : undefined,
      boleto: charge.boletoUrl ? { boletoUrl: charge.boletoUrl, expiresAt: (charge.expiresAt ?? new Date()).toISOString() } : undefined,
      createdAt: charge.createdAt.toISOString(),
      updatedAt: charge.updatedAt.toISOString(),
    };

    // Add splits and fees if present
    if (splits && splits.length > 0) {
      responseData.splits = splits.map((split) => ({
        id: split.id,
        merchantId: split.merchantId,
        amountCents: split.amountCents ?? split.computeAmountForTotal(charge.amountCents),
        percentage: split.percentage,
      }));
    }

    if (fees && fees.length > 0) {
      responseData.fees = fees.map((fee) => ({
        id: fee.id,
        type: fee.type,
        amountCents: fee.amountCents,
      }));
    }

    // Validate response with schema (now supports splits and fees)
    const response = CreateChargeResponseSchema.parse(responseData);

    res.status(201).json(response);
  } catch (err) {
    if (err instanceof ZodError) {
      return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: err.message, details: err.flatten() } });
    }
    logger.error({ err }, "Erro inesperado no POST /charges");
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Erro interno" } });
  }
});