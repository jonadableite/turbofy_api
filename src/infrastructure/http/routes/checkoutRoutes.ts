import { Router, Request, Response } from "express";
import { ZodError } from "zod";
import { CreateCheckoutSessionRequestSchema, CreateCheckoutSessionResponseSchema, GetCheckoutSessionResponseSchema } from "../schemas/checkout";
import { PrismaChargeRepository } from "../../database/PrismaChargeRepository";
import { PaymentProviderFactory } from "../../adapters/payment/PaymentProviderFactory";
import { MessagingFactory } from "../../adapters/messaging/MessagingFactory";
import { PrismaCheckoutConfigRepository } from "../../database/repositories/PrismaCheckoutConfigRepository";
import { PrismaCheckoutSessionRepository } from "../../database/repositories/PrismaCheckoutSessionRepository";
import { CreateCheckoutSession } from "../../../application/useCases/CreateCheckoutSession";
import { IssuePaymentForCharge } from "../../../application/useCases/IssuePaymentForCharge";
import { logger } from "../../logger";
import { env } from "../../../config/env";
import { ChargeMethod } from "../../../domain/entities/Charge";
import { UpdateCheckoutConfigRequestSchema, CheckoutConfigResponseSchema } from "../schemas/checkout";
import { PrismaPaymentInteractionRepository } from "../../database/repositories/PrismaPaymentInteractionRepository";

export const checkoutRouter = Router();

checkoutRouter.post("/sessions", async (req: Request, res: Response) => {
  try {
    const idemKey = req.header("X-Idempotency-Key");
    if (!idemKey) {
      return res.status(400).json({ error: { code: "IDEMPOTENCY_KEY_MISSING", message: "Header X-Idempotency-Key é obrigatório" } });
    }
    const parsed = CreateCheckoutSessionRequestSchema.parse(req.body);

    const chargeRepository = new PrismaChargeRepository();
    const paymentProvider = await PaymentProviderFactory.createForMerchant(parsed.merchantId);
    const messaging = MessagingFactory.create();
    const configRepository = new PrismaCheckoutConfigRepository();
    const sessionRepository = new PrismaCheckoutSessionRepository();
    const paymentInteractionRepository = new PrismaPaymentInteractionRepository();

    const useCase = new CreateCheckoutSession(
      chargeRepository,
      paymentProvider,
      messaging,
      configRepository,
      sessionRepository,
      paymentInteractionRepository
    );

    const { session } = await useCase.execute({
      idempotencyKey: idemKey as string,
      merchantId: parsed.merchantId,
      amountCents: parsed.amountCents,
      initiatorUserId: req.user?.id,
      currency: parsed.currency,
      description: parsed.description,
      expiresAt: parsed.expiresAt ? new Date(parsed.expiresAt) : undefined,
      externalRef: parsed.externalRef,
      metadata: parsed.metadata,
      returnUrl: parsed.returnUrl ?? null,
      cancelUrl: parsed.cancelUrl ?? null,
    });

    const url = `${env.FRONTEND_URL.replace(/\/$/, "")}/checkout/${session.id}`;

    const response = CreateCheckoutSessionResponseSchema.parse({
      id: session.id,
      chargeId: session.chargeId,
      merchantId: session.merchantId,
      status: session.status,
      url,
      expiresAt: session.expiresAt ? session.expiresAt.toISOString() : null,
      createdAt: session.createdAt.toISOString(),
    });

    res.status(201).json(response);
  } catch (err) {
    if (err instanceof ZodError) {
      return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: err.message, details: err.flatten() } });
    }
    logger.error({ err }, "Erro inesperado no POST /checkout/sessions");
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Erro interno" } });
  }
});

checkoutRouter.get("/sessions/:id", async (req: Request, res: Response) => {
  try {
    const sessionRepository = new PrismaCheckoutSessionRepository();
    const chargeRepository = new PrismaChargeRepository();

    const session = await sessionRepository.findById(req.params.id);
    if (!session) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Sessão não encontrada" } });
    }

    const charge = await chargeRepository.findById(session.chargeId);
    if (!charge) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Cobrança não encontrada" } });
    }

    const data: Record<string, unknown> = {
      id: session.id,
      chargeId: session.chargeId,
      merchantId: session.merchantId,
      status: session.status,
      amountCents: charge.amountCents,
      currency: charge.currency,
      description: charge.description ?? null,
      pix: charge.pixQrCode ? { qrCode: charge.pixQrCode, copyPaste: charge.pixCopyPaste!, expiresAt: (charge.expiresAt ?? new Date()).toISOString() } : undefined,
      boleto: charge.boletoUrl ? { boletoUrl: charge.boletoUrl, expiresAt: (charge.expiresAt ?? new Date()).toISOString() } : undefined,
      theme: session.themeSnapshot ?? null,
      expiresAt: session.expiresAt ? session.expiresAt.toISOString() : null,
      createdAt: session.createdAt.toISOString(),
    };

    res.status(200).json(data);
  } catch (err) {
    if (err instanceof ZodError) {
      return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: err.message, details: err.flatten() } });
    }
    logger.error({ err }, "Erro inesperado no GET /checkout/sessions/:id");
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Erro interno" } });
  }
});

checkoutRouter.post("/charges/:id/issue", async (req: Request, res: Response) => {
  try {
    const idemKey = req.header("X-Idempotency-Key");
    if (!idemKey) {
      return res.status(400).json({ error: { code: "IDEMPOTENCY_KEY_MISSING", message: "Header X-Idempotency-Key é obrigatório" } });
    }
    const method = req.body?.method as keyof typeof ChargeMethod | undefined;
    if (!method || !(method in ChargeMethod)) {
      return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "method inválido" } });
    }

    const chargeRepository = new PrismaChargeRepository();
    const existingCharge = await chargeRepository.findById(req.params.id);
    if (!existingCharge) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Cobrança não encontrada" } });
    }

    const paymentProvider = await PaymentProviderFactory.createForMerchant(existingCharge.merchantId);
    const paymentInteractionRepository = new PrismaPaymentInteractionRepository();

    const useCase = new IssuePaymentForCharge(
      chargeRepository,
      paymentProvider,
      paymentInteractionRepository
    );
    const { charge: issuedCharge } = await useCase.execute({
      chargeId: req.params.id,
      method: ChargeMethod[method],
      initiatorUserId: req.user?.id,
    });

    const response = {
      id: issuedCharge.id,
      method: issuedCharge.method ?? null,
      pix: issuedCharge.pixQrCode
        ? {
            qrCode: issuedCharge.pixQrCode,
            copyPaste: issuedCharge.pixCopyPaste!,
            expiresAt: (issuedCharge.expiresAt ?? new Date()).toISOString(),
          }
        : undefined,
      boleto: issuedCharge.boletoUrl
        ? {
            boletoUrl: issuedCharge.boletoUrl,
            expiresAt: (issuedCharge.expiresAt ?? new Date()).toISOString(),
          }
        : undefined,
    };

    res.status(200).json(response);
  } catch (err) {
    if (err instanceof ZodError) {
      return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: err.message, details: err.flatten() } });
    }
    logger.error({ err }, "Erro inesperado no POST /charges/:id/issue");
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Erro interno" } });
  }
});

checkoutRouter.get("/config", async (req: Request, res: Response) => {
  try {
    const merchantId = req.query.merchantId as string | undefined;
    if (!merchantId) {
      return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "merchantId é obrigatório" } });
    }
    const configRepository = new PrismaCheckoutConfigRepository();
    const config = await configRepository.findByMerchantId(merchantId);
    const response = {
      merchantId,
      logoUrl: config?.logoUrl ?? null,
      themeTokens: config?.themeTokens ?? null,
      animations: config?.animations ?? true,
      updatedAt: (config?.updatedAt ?? new Date()).toISOString(),
    };
    res.status(200).json(response);
  } catch (err) {
    if (err instanceof ZodError) {
      return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: err.message, details: err.flatten() } });
    }
    logger.error({ err }, "Erro inesperado no GET /checkout/config");
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Erro interno" } });
  }
});

checkoutRouter.put("/config", async (req: Request, res: Response) => {
  try {
    const parsed = UpdateCheckoutConfigRequestSchema.parse(req.body);
    const configRepository = new PrismaCheckoutConfigRepository();
    const saved = await configRepository.upsert({
      merchantId: parsed.merchantId,
      logoUrl: parsed.logoUrl ?? null,
      themeTokens: parsed.themeTokens ?? undefined,
      animations: parsed.animations,
    });
    const response = {
      merchantId: saved.merchantId,
      logoUrl: saved.logoUrl ?? null,
      themeTokens: saved.themeTokens ?? null,
      animations: saved.animations,
      updatedAt: saved.updatedAt.toISOString(),
    };
    res.status(200).json(response);
  } catch (err) {
    if (err instanceof ZodError) {
      return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: err.message, details: err.flatten() } });
    }
    logger.error({ err }, "Erro inesperado no PUT /checkout/config");
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Erro interno" } });
  }
});
