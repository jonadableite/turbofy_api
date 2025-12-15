import { Settlement, SettlementStatus } from "../../domain/entities/Settlement";
import { SettlementRepository } from "../../ports/SettlementRepository";
import { BankingPort } from "../../ports/BankingPort";
import { MessagingPort } from "../../ports/MessagingPort";
import { randomUUID } from "crypto";
import { logger } from "../../infrastructure/logger";

interface ProcessSettlementInput {
  settlementId: string;
}

interface ProcessSettlementOutput {
  settlement: Settlement;
}

export class ProcessSettlement {
  constructor(
    private readonly settlementRepository: SettlementRepository,
    private readonly banking: BankingPort,
    private readonly messaging: MessagingPort
  ) {}

  async execute(input: ProcessSettlementInput): Promise<ProcessSettlementOutput> {
    // 1. Find settlement
    const settlement = await this.settlementRepository.findById(input.settlementId);
    if (!settlement) {
      throw new Error(`Settlement ${input.settlementId} not found`);
    }

    // 2. Validate settlement can be processed
    if (!settlement.canBeProcessed()) {
      throw new Error(`Settlement ${input.settlementId} cannot be processed in status ${settlement.status}`);
    }

    if (!settlement.isDue()) {
      throw new Error(`Settlement ${input.settlementId} is not due yet`);
    }

    if (!settlement.bankAccountId) {
      throw new Error(`Settlement ${input.settlementId} does not have a bank account`);
    }

    // 3. Start processing
    settlement.startProcessing();
    let updated = await this.settlementRepository.update(settlement);

    // 4. Process via banking port
    try {
      const response = await this.banking.processSettlement({
        merchantId: settlement.merchantId,
        amountCents: settlement.amountCents,
        bankAccountId: settlement.bankAccountId,
        description: `Settlement ${settlement.id}`,
        settlementId: settlement.id,
      });

      // 5. Update settlement based on response
      if (response.transactionId) {
        updated.setTransactionId(response.transactionId);
      }

      if (response.status === "COMPLETED") {
        updated.complete(response.transactionId ?? updated.transactionId ?? "");
      } else if (response.status === "FAILED") {
        updated.fail(response.failureReason ?? "Unknown error");
      }

      updated = await this.settlementRepository.update(updated);

      // 6. Publish event
      await this.messaging.publish({
        id: randomUUID(),
        type: "settlement.processed",
        timestamp: new Date().toISOString(),
        version: "v1",
        traceId: settlement.id,
        routingKey: "turbofy.billing.settlement.processed",
        payload: {
          id: updated.id,
          merchantId: updated.merchantId,
          amountCents: updated.amountCents,
          status: updated.status,
          transactionId: updated.transactionId,
          processedAt: updated.processedAt?.toISOString(),
        },
      });

      logger.info(
        {
          useCase: "ProcessSettlement",
          settlementId: updated.id,
          status: updated.status,
          transactionId: updated.transactionId,
        },
        "Settlement processed"
      );

      return { settlement: updated };
    } catch (error) {
      // 7. Handle errors
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      updated.fail(errorMessage);
      updated = await this.settlementRepository.update(updated);

      logger.error(
        {
          useCase: "ProcessSettlement",
          settlementId: updated.id,
          error: errorMessage,
        },
        "Settlement processing failed"
      );

      throw error;
    }
  }
}

