import { Router, Request, Response } from "express";
import { CreateSettlementRequestSchema, ProcessSettlementRequestSchema } from "../schemas/settlements";
import { ZodError } from "zod";
import { PrismaSettlementRepository } from "../../database/PrismaSettlementRepository";
import { prisma } from "../../database/prismaClient";
import { BankingFactory } from "../../adapters/banking/BankingFactory";
import { MessagingFactory } from "../../adapters/messaging/MessagingFactory";
import { CreateSettlement } from "../../../application/useCases/CreateSettlement";
import { ProcessSettlement } from "../../../application/useCases/ProcessSettlement";
import { logger } from "../../logger";

export const settlementsRouter = Router();

settlementsRouter.post("/", async (req: Request, res: Response) => {
  try {
    const parsed = CreateSettlementRequestSchema.parse(req.body);

    const settlementRepository = new PrismaSettlementRepository(prisma);
    const messaging = MessagingFactory.create();

    const useCase = new CreateSettlement(settlementRepository, messaging);

    const { settlement } = await useCase.execute({
      merchantId: parsed.merchantId,
      amountCents: parsed.amountCents,
      currency: parsed.currency,
      bankAccountId: parsed.bankAccountId,
      scheduledFor: parsed.scheduledFor ? new Date(parsed.scheduledFor) : undefined,
      metadata: parsed.metadata,
    });

    res.status(201).json({
      id: settlement.id,
      merchantId: settlement.merchantId,
      amountCents: settlement.amountCents,
      currency: settlement.currency,
      status: settlement.status,
      scheduledFor: settlement.scheduledFor?.toISOString(),
      bankAccountId: settlement.bankAccountId,
      createdAt: settlement.createdAt.toISOString(),
      updatedAt: settlement.updatedAt.toISOString(),
    });
  } catch (err) {
    if (err instanceof ZodError) {
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: err.message,
          details: err.flatten(),
        },
      });
    }
    logger.error({ err }, "Erro inesperado no POST /settlements");
    res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: err instanceof Error ? err.message : "Erro interno",
      },
    });
  }
});

settlementsRouter.post("/:id/process", async (req: Request, res: Response) => {
  try {
    const parsed = ProcessSettlementRequestSchema.parse({
      settlementId: req.params.id,
    });

    const settlementRepository = new PrismaSettlementRepository(prisma);
    const banking = BankingFactory.create();
    const messaging = MessagingFactory.create();

    const useCase = new ProcessSettlement(settlementRepository, banking, messaging);

    const { settlement } = await useCase.execute({
      settlementId: parsed.settlementId,
    });

    res.status(200).json({
      id: settlement.id,
      merchantId: settlement.merchantId,
      amountCents: settlement.amountCents,
      currency: settlement.currency,
      status: settlement.status,
      transactionId: settlement.transactionId,
      processedAt: settlement.processedAt?.toISOString(),
      failureReason: settlement.failureReason,
      updatedAt: settlement.updatedAt.toISOString(),
    });
  } catch (err) {
    if (err instanceof ZodError) {
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: err.message,
          details: err.flatten(),
        },
      });
    }
    logger.error({ err }, "Erro inesperado no POST /settlements/:id/process");
    res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: err instanceof Error ? err.message : "Erro interno",
      },
    });
  }
});

