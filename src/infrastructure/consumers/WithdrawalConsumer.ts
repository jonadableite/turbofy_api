import { EventHandler } from "../adapters/messaging/RabbitMQConsumer";
import { ProcessWithdrawalUseCase } from "../../application/useCases/balance/ProcessWithdrawalUseCase";
import { PrismaUserLedgerRepository } from "../database/PrismaUserLedgerRepository";
import { PrismaUserPixKeyRepository } from "../database/PrismaUserPixKeyRepository";
import { PrismaWithdrawalRepository } from "../database/PrismaWithdrawalRepository";
import { logger } from "../logger";

export class WithdrawalConsumer implements EventHandler {
  private readonly processWithdrawal: ProcessWithdrawalUseCase;

  constructor() {
    const ledgerRepo = new PrismaUserLedgerRepository();
    const pixKeyRepo = new PrismaUserPixKeyRepository();
    const withdrawalRepo = new PrismaWithdrawalRepository();
    this.processWithdrawal = new ProcessWithdrawalUseCase(
      ledgerRepo,
      pixKeyRepo,
      withdrawalRepo
    );
  }

  async handle(event: unknown): Promise<void> {
    const parsed = event as { payload?: { withdrawalId?: string } };
    const withdrawalId = parsed.payload?.withdrawalId;
    if (!withdrawalId) {
      logger.warn({
        type: "WITHDRAWAL_MISSING_ID",
        message: "withdrawal event without withdrawalId",
        payload: { event },
      });
      return;
    }

    try {
      await this.processWithdrawal.execute({ withdrawalId });
      logger.info({
        type: "WITHDRAWAL_PROCESSED",
        message: "Processed withdrawal event",
        payload: { withdrawalId },
      });
    } catch (error) {
      logger.error({
        type: "WITHDRAWAL_PROCESS_FAILED",
        message: "Failed to process withdrawal event",
        error,
        payload: { withdrawalId },
      });
    }
  }
}

