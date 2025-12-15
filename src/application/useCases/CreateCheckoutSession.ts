import { CreateCharge } from "./CreateCharge";
import { CheckoutConfigRepository } from "../../ports/repositories/CheckoutConfigRepository";
import { CheckoutSessionRepository, CheckoutSessionRecord } from "../../ports/repositories/CheckoutSessionRepository";
import { ChargeRepository } from "../../ports/ChargeRepository";
import { PaymentProviderPort } from "../../ports/PaymentProviderPort";
import { MessagingPort } from "../../ports/MessagingPort";
import { logger } from "../../infrastructure/logger";
import { PaymentInteractionRepository } from "../../ports/repositories/PaymentInteractionRepository";
import { PaymentInteraction, PaymentInteractionType } from "../../domain/entities/PaymentInteraction";

interface CreateCheckoutSessionInput {
  idempotencyKey: string;
  merchantId: string;
  initiatorUserId?: string;
  amountCents: number;
  currency: string;
  description?: string;
  expiresAt?: Date;
  externalRef?: string;
  metadata?: Record<string, unknown>;
  returnUrl?: string | null;
  cancelUrl?: string | null;
}

interface CreateCheckoutSessionOutput {
  session: CheckoutSessionRecord;
}

export class CreateCheckoutSession {
  constructor(
    private readonly chargeRepository: ChargeRepository,
    private readonly paymentProvider: PaymentProviderPort,
    private readonly messaging: MessagingPort,
    private readonly checkoutConfigRepository: CheckoutConfigRepository,
    private readonly checkoutSessionRepository: CheckoutSessionRepository,
    private readonly paymentInteractionRepository: PaymentInteractionRepository
  ) {}

  async execute(input: CreateCheckoutSessionInput): Promise<CreateCheckoutSessionOutput> {
    const PLATFORM_FEE_PERCENT = 1;
    const createCharge = new CreateCharge(
      this.chargeRepository,
      this.paymentProvider,
      this.messaging,
      this.paymentInteractionRepository
    );
    const chargeResult = await createCharge.execute({
      idempotencyKey: input.idempotencyKey,
      merchantId: input.merchantId,
      initiatorUserId: input.initiatorUserId,
      amountCents: input.amountCents,
      currency: input.currency,
      description: input.description,
      expiresAt: input.expiresAt,
      externalRef: input.externalRef,
      metadata: input.metadata,
      fees: [{ type: "platform", amountCents: Math.round((input.amountCents * PLATFORM_FEE_PERCENT) / 100) }],
    });

    const config = await this.checkoutConfigRepository.findByMerchantId(input.merchantId);

    const session = await this.checkoutSessionRepository.create({
      chargeId: chargeResult.charge.id,
      merchantId: input.merchantId,
      returnUrl: input.returnUrl ?? null,
      cancelUrl: input.cancelUrl ?? null,
      themeSnapshot: config?.themeTokens ? { themeTokens: config.themeTokens, logoUrl: config.logoUrl, animations: config.animations } : null,
      expiresAt: input.expiresAt ?? null,
    });

    await this.paymentInteractionRepository.create(
      PaymentInteraction.create({
        merchantId: input.merchantId,
        chargeId: chargeResult.charge.id,
        sessionId: session.id,
        type: PaymentInteractionType.CHECKOUT_SESSION_CREATED,
        userId: input.initiatorUserId,
        amountCents: chargeResult.charge.amountCents,
        metadata: {
          returnUrl: session.returnUrl,
          cancelUrl: session.cancelUrl,
        },
      })
    );

    logger.info({ useCase: "CreateCheckoutSession", entityId: session.id }, "Checkout session created");

    return { session };
  }
}
