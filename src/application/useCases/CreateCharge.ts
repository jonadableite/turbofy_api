// 📦 APPLICATION: Use case to create a Charge with full business orchestration
// 🔐 SECURITY: All inputs must be validated before reaching this layer (HTTP schemas)
// 🛠️ MAINTAINABILITY: Follows Clean Architecture – ports injected via constructor
// 🧪 TESTABILITY: Pure class, collaborators mocked in unit tests
// 🔄 EXTENSIBILITY: Easy to add new payment methods (Pix, Boleto, CreditCard, etc.)

import { Charge, ChargeMethod, ChargeStatus } from "../../domain/entities/Charge";
import { ChargeSplit } from "../../domain/entities/ChargeSplit";
import { Fee } from "../../domain/entities/Fee";
import { ChargeRepository } from "../../ports/ChargeRepository";
import { PaymentProviderPort } from "../../ports/PaymentProviderPort";
import { MessagingPort } from "../../ports/MessagingPort";
import { randomUUID } from "crypto";
import { logger } from "../../infrastructure/logger";
import { PaymentInteractionRepository } from "../../ports/repositories/PaymentInteractionRepository";
import { PaymentInteraction, PaymentInteractionType } from "../../domain/entities/PaymentInteraction";
import { RifeiroSplitCalculator } from "../services/RifeiroSplitCalculator";
import { prisma } from "../../infrastructure/database/prismaClient";

interface CreateChargeInput {
  idempotencyKey: string;
  merchantId: string;
  initiatorUserId?: string;
  amountCents: number;
  currency: string;
  description?: string;
  method?: ChargeMethod;
  expiresAt?: Date;
  externalRef?: string;
  metadata?: Record<string, unknown>;
  splits?: Array<{
    merchantId: string;
    amountCents?: number;
    percentage?: number;
  }>;
  fees?: Array<{
    type: string;
    amountCents: number;
  }>;
}

interface CreateChargeOutput {
  charge: Charge;
  splits?: ChargeSplit[];
  fees?: Fee[];
}

export class CreateCharge {
  constructor(
    private readonly chargeRepository: ChargeRepository,
    private readonly paymentProvider: PaymentProviderPort,
    private readonly messaging: MessagingPort,
    private readonly paymentInteractionRepository: PaymentInteractionRepository
  ) {}

  async execute(input: CreateChargeInput): Promise<CreateChargeOutput> {
    // 1. Idempotency check
    const existing = await this.chargeRepository.findByIdempotencyKey(
      input.idempotencyKey
    );
    if (existing) {
      logger.info(
        {
          useCase: "CreateCharge",
          message: "Idempotent request – returning existing charge",
          idempotencyKey: input.idempotencyKey,
        },
        "Idempotent hit"
      );
      return { charge: existing };
    }

    // 2. Validação de valor mínimo (R$ 5,00 = 500 centavos)
    const MIN_AMOUNT_CENTS = 500;
    if (input.amountCents < MIN_AMOUNT_CENTS) {
      throw new Error(
        `Valor mínimo para cobrança é R$ 5,00 (500 centavos). Valor recebido: R$ ${(input.amountCents / 100).toFixed(2)}`
      );
    }

    // 3. Build domain entity
    const charge = new Charge({
      id: randomUUID(),
      merchantId: input.merchantId,
      amountCents: input.amountCents,
      currency: input.currency,
      description: input.description,
      status: ChargeStatus.PENDING,
      method: input.method,
      expiresAt: input.expiresAt,
      idempotencyKey: input.idempotencyKey,
      externalRef: input.externalRef,
      metadata: input.metadata,
    });

    // 3. Verificar se é um Rifeiro e calcular splits/taxas automaticamente
    const merchant = await prisma.merchant.findUnique({
      where: { id: input.merchantId },
      select: { type: true },
    });

    const isRifeiro = merchant?.type === "RIFEIRO";
    const shouldAutoCalculate = isRifeiro && (!input.splits || input.splits.length === 0);

    let splits: ChargeSplit[] = [];
    let fees: Fee[] = [];

    if (shouldAutoCalculate) {
      // Calcular splits e taxas automaticamente para Rifeiro
      const splitCalculator = new RifeiroSplitCalculator();
      const calculated = await splitCalculator.calculate({
        rifeiroMerchantId: input.merchantId,
        chargeId: charge.id,
        amountCents: charge.amountCents,
      });

      splits = calculated.splits;
      fees = calculated.fees;

      // Validar que splits + fees não excedem o valor total
      const totalDeductions = calculated.totalSplitAmount + calculated.totalFeeAmount;
      if (totalDeductions > charge.amountCents) {
        throw new Error(
          `Total deductions (${totalDeductions}) exceed charge amount (${charge.amountCents})`
        );
      }
    } else {
      // 3a. Validate splits if provided manually
      if (input.splits && input.splits.length > 0) {
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
      }

      // 4. Validate fees if provided manually
      if (input.fees && input.fees.length > 0) {
        let totalFees = 0;
        
        for (const feeInput of input.fees) {
          const fee = new Fee({
            chargeId: charge.id,
            type: feeInput.type,
            amountCents: feeInput.amountCents,
          });
          
          totalFees += fee.amountCents;
          fees.push(fee);
        }
        
        // Validate that fees don't exceed charge amount
        if (totalFees > charge.amountCents) {
          throw new Error(
            `Total fees (${totalFees}) exceed charge amount (${charge.amountCents})`
          );
        }
      }
    }

    // 5. Persist initial charge
    let persisted = await this.chargeRepository.create(charge);

    // 6. Persist splits if any
    const persistedSplits: ChargeSplit[] = [];
    for (const split of splits) {
      const persistedSplit = await this.chargeRepository.addSplit(charge.id, split);
      persistedSplits.push(persistedSplit);
    }

    // 7. Persist fees if any
    const persistedFees: Fee[] = [];
    for (const fee of fees) {
      const persistedFee = await this.chargeRepository.addFee(charge.id, fee);
      persistedFees.push(persistedFee);
    }

    await this.paymentInteractionRepository.create(
      PaymentInteraction.create({
        merchantId: persisted.merchantId,
        userId: input.initiatorUserId,
        chargeId: persisted.id,
        type: PaymentInteractionType.CHARGE_CREATED,
        method: persisted.method,
        amountCents: persisted.amountCents,
        metadata: {
          idempotencyKey: input.idempotencyKey,
          splits: persistedSplits.length,
          fees: persistedFees.length,
        },
      })
    );

    // 8. Emit payment via provider depending on method
    if (persisted.method === ChargeMethod.PIX) {
      const pixData = await this.paymentProvider.issuePixCharge({
        amountCents: persisted.amountCents,
        merchantId: persisted.merchantId,
        description: persisted.description,
        expiresAt: persisted.expiresAt ?? undefined,
      });
      persisted = persisted.withPixData(pixData.qrCode, pixData.copyPaste);

      await this.paymentInteractionRepository.create(
        PaymentInteraction.create({
          merchantId: persisted.merchantId,
          userId: input.initiatorUserId,
          chargeId: persisted.id,
          type: PaymentInteractionType.PIX_ISSUED,
          method: ChargeMethod.PIX,
          amountCents: persisted.amountCents,
          metadata: {
            expiresAt: (persisted.expiresAt ?? new Date()).toISOString(),
          },
        })
      );
    } else if (persisted.method === ChargeMethod.BOLETO) {
      const boletoData = await this.paymentProvider.issueBoletoCharge({
        amountCents: persisted.amountCents,
        merchantId: persisted.merchantId,
        description: persisted.description,
        expiresAt: persisted.expiresAt ?? undefined,
      });
      persisted = persisted.withBoletoData(boletoData.boletoUrl);

      await this.paymentInteractionRepository.create(
        PaymentInteraction.create({
          merchantId: persisted.merchantId,
          userId: input.initiatorUserId,
          chargeId: persisted.id,
          type: PaymentInteractionType.BOLETO_ISSUED,
          method: ChargeMethod.BOLETO,
          amountCents: persisted.amountCents,
          metadata: {
            expiresAt: (persisted.expiresAt ?? new Date()).toISOString(),
          },
        })
      );
    }

    // 9. Update persisted charge with payment data (if any)
    if (persisted.pixQrCode || persisted.boletoUrl) {
      persisted = await this.chargeRepository.update(persisted);
    }

    // 10. Publish event (structured, idempotent)
    await this.messaging.publish({
      id: randomUUID(),
      type: "charge.created",
      timestamp: new Date().toISOString(),
      version: "v1",
      traceId: input.idempotencyKey,
      idempotencyKey: input.idempotencyKey,
      routingKey: "turbofy.payments.charge.created",
      payload: {
        id: persisted.id,
        merchantId: persisted.merchantId,
        amountCents: persisted.amountCents,
        currency: persisted.currency,
        status: persisted.status,
        method: persisted.method,
        splitsCount: persistedSplits.length,
        feesCount: persistedFees.length,
        createdAt: persisted.createdAt.toISOString(),
      },
    });

    // 11. Publish split events if any
    for (const split of persistedSplits) {
      await this.messaging.publish({
        id: randomUUID(),
        type: "charge.split.created",
        timestamp: new Date().toISOString(),
        version: "v1",
        traceId: input.idempotencyKey,
        idempotencyKey: input.idempotencyKey,
        routingKey: "turbofy.payments.charge.split.created",
        payload: {
          id: split.id,
          chargeId: split.chargeId,
          merchantId: split.merchantId,
          amountCents: split.amountCents ?? split.computeAmountForTotal(persisted.amountCents),
          percentage: split.percentage,
        },
      });
    }

    return {
      charge: persisted,
      splits: persistedSplits.length > 0 ? persistedSplits : undefined,
      fees: persistedFees.length > 0 ? persistedFees : undefined,
    };
  }
}
