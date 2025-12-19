import { Request, Response } from "express";
import { GetBalanceUseCase } from "../../../application/useCases/balance/GetBalanceUseCase";
import { PrismaUserLedgerRepository } from "../../database/PrismaUserLedgerRepository";
import { logger } from "../../logger";

const ledgerRepository = new PrismaUserLedgerRepository();
const getBalance = new GetBalanceUseCase(ledgerRepository);

export class BalanceController {
  async get(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const balance = await getBalance.execute({ userId });
      return res.json(balance);
    } catch (error) {
      logger.error({ error }, "Error getting balance");
      return res.status(400).json({ error: error instanceof Error ? error.message : "Unknown error" });
    }
  }
}

