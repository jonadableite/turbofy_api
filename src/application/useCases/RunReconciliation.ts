import {
  Reconciliation,
  ReconciliationStatus,
  ReconciliationType,
} from "../../domain/entities/Reconciliation";
import { ReconciliationRepository } from "../../ports/ReconciliationRepository";
import { ChargeRepository } from "../../ports/ChargeRepository";
import { MessagingPort } from "../../ports/MessagingPort";
import { randomUUID } from "crypto";
import { logger } from "../../infrastructure/logger";

interface RunReconciliationInput {
  merchantId: string;
  startDate: Date;
  endDate: Date;
  type: ReconciliationType;
}

interface RunReconciliationOutput {
  reconciliation: Reconciliation;
}

export class RunReconciliation {
  constructor(
    private readonly reconciliationRepository: ReconciliationRepository,
    private readonly chargeRepository: ChargeRepository,
    private readonly messaging: MessagingPort
  ) {}

  async execute(input: RunReconciliationInput): Promise<RunReconciliationOutput> {
    // 1. Create reconciliation entity
    const reconciliation = new Reconciliation({
      merchantId: input.merchantId,
      type: input.type,
      startDate: input.startDate,
      endDate: input.endDate,
    });

    // 2. Persist reconciliation
    let persisted = await this.reconciliationRepository.create(reconciliation);

    // 3. Start processing
    try {
      // Get all charges in the date range
      // Note: This is a simplified implementation
      // In production, you would fetch charges from the database
      // and match them with transactions from the banking system
      
      // For now, we'll simulate the reconciliation process
      const totalAmountCents = 0; // Would be calculated from charges
      persisted.startProcessing(totalAmountCents);
      persisted = await this.reconciliationRepository.update(persisted);

      // 4. Match charges with transactions
      // This would involve:
      // - Fetching charges from database
      // - Fetching transactions from banking system
      // - Matching by transaction ID, amount, date, etc.
      // - Identifying unmatched charges and transactions

      // Example matching logic (simplified):
      // const charges = await this.chargeRepository.findByMerchantIdAndDateRange(
      //   input.merchantId,
      //   input.startDate,
      //   input.endDate
      // );
      // 
      // for (const charge of charges) {
      //   if (charge.status === "PAID" && charge.transactionId) {
      //     // Match found
      //     persisted.addMatch(charge.id, charge.amountCents, charge.transactionId);
      //   } else {
      //     // Unmatched charge
      //     persisted.addUnmatchedCharge(charge.id);
      //   }
      // }

      // 5. Complete reconciliation
      persisted.complete();
      persisted = await this.reconciliationRepository.update(persisted);

      // 6. Publish event
      await this.messaging.publish({
        id: randomUUID(),
        type: "reconciliation.completed",
        timestamp: new Date().toISOString(),
        version: "v1",
        traceId: persisted.id,
        routingKey: "turbofy.reconciliation.completed",
        payload: {
          id: persisted.id,
          merchantId: persisted.merchantId,
          type: persisted.type,
          status: persisted.status,
          startDate: persisted.startDate.toISOString(),
          endDate: persisted.endDate.toISOString(),
          matchesCount: persisted.matches.length,
          unmatchedChargesCount: persisted.unmatchedCharges.length,
          unmatchedTransactionsCount: persisted.unmatchedTransactions.length,
          matchRate: persisted.getMatchRate(),
          processedAt: persisted.processedAt?.toISOString(),
        },
      });

      logger.info(
        {
          useCase: "RunReconciliation",
          reconciliationId: persisted.id,
          status: persisted.status,
          matchRate: persisted.getMatchRate(),
        },
        "Reconciliation completed"
      );

      return { reconciliation: persisted };
    } catch (error) {
      // 7. Handle errors
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      persisted.fail(errorMessage);
      persisted = await this.reconciliationRepository.update(persisted);

      logger.error(
        {
          useCase: "RunReconciliation",
          reconciliationId: persisted.id,
          error: errorMessage,
        },
        "Reconciliation failed"
      );

      throw error;
    }
  }
}

