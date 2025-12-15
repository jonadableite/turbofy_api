import { Settlement, SettlementStatus } from "../../domain/entities/Settlement";
import { SettlementRepository } from "../../ports/SettlementRepository";
import { MessagingPort } from "../../ports/MessagingPort";
import { randomUUID } from "crypto";
import { logger } from "../../infrastructure/logger";

interface CreateSettlementInput {
  merchantId: string;
  amountCents: number;
  currency: string;
  bankAccountId: string;
  scheduledFor?: Date;
  metadata?: Record<string, unknown>;
}

interface CreateSettlementOutput {
  settlement: Settlement;
}

export class CreateSettlement {
  constructor(
    private readonly settlementRepository: SettlementRepository,
    private readonly messaging: MessagingPort
  ) {}

  async execute(input: CreateSettlementInput): Promise<CreateSettlementOutput> {
    // 1. Create settlement entity
    const settlement = new Settlement({
      merchantId: input.merchantId,
      amountCents: input.amountCents,
      currency: input.currency,
      bankAccountId: input.bankAccountId,
      metadata: input.metadata,
    });

    // 2. Schedule if scheduledFor is provided
    if (input.scheduledFor) {
      settlement.schedule(input.scheduledFor, input.bankAccountId);
    }

    // 3. Persist settlement
    const persisted = await this.settlementRepository.create(settlement);

    // 4. Publish event
    await this.messaging.publish({
      id: randomUUID(),
      type: "settlement.created",
      timestamp: new Date().toISOString(),
      version: "v1",
      traceId: persisted.id,
      routingKey: "turbofy.billing.settlement.created",
      payload: {
        id: persisted.id,
        merchantId: persisted.merchantId,
        amountCents: persisted.amountCents,
        currency: persisted.currency,
        status: persisted.status,
        scheduledFor: persisted.scheduledFor?.toISOString(),
        bankAccountId: persisted.bankAccountId,
        createdAt: persisted.createdAt.toISOString(),
      },
    });

    logger.info(
      {
        useCase: "CreateSettlement",
        settlementId: persisted.id,
        merchantId: persisted.merchantId,
        amountCents: persisted.amountCents,
      },
      "Settlement created"
    );

    return { settlement: persisted };
  }
}

