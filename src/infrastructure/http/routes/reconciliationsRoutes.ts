import { Router, Request, Response } from "express";
import { CreateReconciliationRequestSchema } from "../schemas/reconciliations";
import { ZodError } from "zod";
import { PrismaReconciliationRepository } from "../../database/PrismaReconciliationRepository";
import { PrismaChargeRepository } from "../../database/PrismaChargeRepository";
import { prisma } from "../../database/prismaClient";
import { MessagingFactory } from "../../adapters/messaging/MessagingFactory";
import { RunReconciliation } from "../../../application/useCases/RunReconciliation";
import { ReconciliationType } from "../../../domain/entities/Reconciliation";
import { logger } from "../../logger";

export const reconciliationsRouter = Router();

reconciliationsRouter.post("/", async (req: Request, res: Response) => {
  try {
    const parsed = CreateReconciliationRequestSchema.parse(req.body);

    const reconciliationRepository = new PrismaReconciliationRepository(prisma);
    const chargeRepository = new PrismaChargeRepository();
    const messaging = MessagingFactory.create();

    const useCase = new RunReconciliation(
      reconciliationRepository,
      chargeRepository,
      messaging
    );

    const { reconciliation } = await useCase.execute({
      merchantId: parsed.merchantId,
      startDate: new Date(parsed.startDate),
      endDate: new Date(parsed.endDate),
      type: parsed.type as ReconciliationType,
    });

    res.status(201).json({
      id: reconciliation.id,
      merchantId: reconciliation.merchantId,
      type: reconciliation.type,
      status: reconciliation.status,
      startDate: reconciliation.startDate.toISOString(),
      endDate: reconciliation.endDate.toISOString(),
      matchesCount: reconciliation.matches.length,
      unmatchedChargesCount: reconciliation.unmatchedCharges.length,
      unmatchedTransactionsCount: reconciliation.unmatchedTransactions.length,
      totalAmountCents: reconciliation.totalAmountCents,
      matchedAmountCents: reconciliation.matchedAmountCents,
      matchRate: reconciliation.getMatchRate(),
      processedAt: reconciliation.processedAt?.toISOString(),
      failureReason: reconciliation.failureReason,
      createdAt: reconciliation.createdAt.toISOString(),
      updatedAt: reconciliation.updatedAt.toISOString(),
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
    logger.error({ err }, "Erro inesperado no POST /reconciliations");
    res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: err instanceof Error ? err.message : "Erro interno",
      },
    });
  }
});

