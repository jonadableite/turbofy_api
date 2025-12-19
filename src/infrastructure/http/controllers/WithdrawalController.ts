import { Request, Response } from "express";
import { z } from "zod";
import { PrismaUserLedgerRepository } from "../../database/PrismaUserLedgerRepository";
import { PrismaUserPixKeyRepository } from "../../database/PrismaUserPixKeyRepository";
import { PrismaWithdrawalRepository } from "../../database/PrismaWithdrawalRepository";
import { RequestWithdrawalUseCase } from "../../../application/useCases/balance/RequestWithdrawalUseCase";
import { GetBalanceUseCase } from "../../../application/useCases/balance/GetBalanceUseCase";
import { ProcessWithdrawalUseCase } from "../../../application/useCases/balance/ProcessWithdrawalUseCase";
import { logger } from "../../logger";

const ledgerRepository = new PrismaUserLedgerRepository();
const pixKeyRepository = new PrismaUserPixKeyRepository();
const withdrawalRepository = new PrismaWithdrawalRepository();

const requestWithdrawal = new RequestWithdrawalUseCase(
  ledgerRepository,
  pixKeyRepository,
  withdrawalRepository
);
const getBalance = new GetBalanceUseCase(ledgerRepository);
const processWithdrawal = new ProcessWithdrawalUseCase(
  ledgerRepository,
  pixKeyRepository,
  withdrawalRepository
);

const requestSchema = z.object({
  amountCents: z.number().int().positive(),
  idempotencyKey: z.string().min(8),
});

export class WithdrawalController {
  async create(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const body = requestSchema.parse(req.body);
      const withdrawal = await requestWithdrawal.execute({
        userId,
        amountCents: body.amountCents,
        idempotencyKey: body.idempotencyKey,
      });
      return res.status(201).json(withdrawal);
    } catch (error) {
      logger.error({ error }, "Error creating withdrawal");
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Validation error", details: error.issues });
      }
      return res.status(400).json({ error: error instanceof Error ? error.message : "Unknown error" });
    }
  }

  async get(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const id = req.params.id;
      const withdrawal = await withdrawalRepository.findById(id);
      if (!withdrawal || withdrawal.userId !== userId) {
        return res.status(404).json({ error: "Withdrawal not found" });
      }
      return res.json(withdrawal);
    } catch (error) {
      logger.error({ error }, "Error fetching withdrawal");
      return res.status(400).json({ error: error instanceof Error ? error.message : "Unknown error" });
    }
  }

  async history(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      // Simple history: derive from ledger entries
      const balance = await getBalance.execute({ userId });
      const ledger = await ledgerRepository.getEntriesForUser(userId);
      return res.json({ balance, ledger });
    } catch (error) {
      logger.error({ error }, "Error fetching withdrawal history");
      return res.status(400).json({ error: error instanceof Error ? error.message : "Unknown error" });
    }
  }

  async process(req: Request, res: Response) {
    try {
      const adminId = req.user?.id;
      if (!adminId || !req.user?.roles?.includes("ADMIN")) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const id = req.params.id;
      const withdrawal = await processWithdrawal.execute({ withdrawalId: id });
      return res.json(withdrawal);
    } catch (error) {
      logger.error({ error }, "Error processing withdrawal");
      return res.status(400).json({ error: error instanceof Error ? error.message : "Unknown error" });
    }
  }
}

