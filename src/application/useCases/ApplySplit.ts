import { ChargeSplit } from "../../domain/entities/ChargeSplit";
import { ChargeRepository } from "../../ports/ChargeRepository";
import { MessagingPort } from "../../ports/MessagingPort";
import { randomUUID } from "crypto";
import { logger } from "../../infrastructure/logger";

interface ApplySplitInput {
  chargeId: string;
  splits: Array<{
    merchantId: string;
    amountCents?: number;
    percentage?: number;
  }>;
}

interface ApplySplitOutput {
  splits: ChargeSplit[];
}

export class ApplySplit {
  constructor(
    private readonly chargeRepository: ChargeRepository,
    private readonly messaging: MessagingPort
  ) {}

  async execute(input: ApplySplitInput): Promise<ApplySplitOutput> {
    // 1. Find charge
    const charge = await this.chargeRepository.findById(input.chargeId);
    if (!charge) {
      throw new Error(`Charge ${input.chargeId} not found`);
    }

    // 2. Validate splits
    if (!input.splits || input.splits.length === 0) {
      throw new Error("At least one split is required");
    }

    const splits: ChargeSplit[] = [];
    let totalSplitAmount = 0;

    for (const splitInput of input.splits) {
      const split = new ChargeSplit({
        chargeId: charge.id,
        merchantId: splitInput.merchantId,
        amountCents: splitInput.amountCents,
        percentage: splitInput.percentage,
      });

      const splitAmount = split.computeAmountForTotal(charge.amountCents);
      totalSplitAmount += splitAmount;

      if (totalSplitAmount > charge.amountCents) {
        throw new Error(
          `Total split amount (${totalSplitAmount}) exceeds charge amount (${charge.amountCents})`
        );
      }

      splits.push(split);
    }

    // 3. Persist splits
    const persistedSplits: ChargeSplit[] = [];
    for (const split of splits) {
      const persistedSplit = await this.chargeRepository.addSplit(charge.id, split);
      persistedSplits.push(persistedSplit);

      // 4. Publish event for each split
      await this.messaging.publish({
        id: randomUUID(),
        type: "charge.split.created",
        timestamp: new Date().toISOString(),
        version: "v1",
        traceId: charge.id,
        routingKey: "turbofy.payments.charge.split.created",
        payload: {
          id: persistedSplit.id,
          chargeId: persistedSplit.chargeId,
          merchantId: persistedSplit.merchantId,
          amountCents: persistedSplit.amountCents ?? persistedSplit.computeAmountForTotal(charge.amountCents),
          percentage: persistedSplit.percentage,
        },
      });
    }

    logger.info(
      {
        useCase: "ApplySplit",
        chargeId: charge.id,
        splitsCount: persistedSplits.length,
      },
      "Splits applied to charge"
    );

    return { splits: persistedSplits };
  }
}

