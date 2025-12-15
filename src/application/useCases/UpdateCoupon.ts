import { Coupon } from "../../domain/entities/Coupon";
import { logger } from "../../infrastructure/logger";
import { CouponRepository } from "../../ports/repositories/CouponRepository";

/**
 * @security Validates merchant ownership before updating
 * @performance Single transaction for update
 * @maintainability Clean use case with partial updates
 * @testability Dependencies injected for easy mocking
 */

interface UpdateCouponInput {
  couponId: string;
  merchantId: string;
  description?: string;
  percentage?: number;
  amountCents?: number;
  maxRedemptions?: number;
  expiresAt?: Date;
  active?: boolean;
}

interface UpdateCouponOutput {
  coupon: Coupon;
}

export class CouponNotFoundError extends Error {
  constructor(couponId: string) {
    super(`Cupom não encontrado: ${couponId}`);
    this.name = "CouponNotFoundError";
  }
}

export class CouponUnauthorizedError extends Error {
  constructor() {
    super("Você não tem permissão para atualizar este cupom");
    this.name = "CouponUnauthorizedError";
  }
}

export class UpdateCoupon {
  constructor(private readonly couponRepository: CouponRepository) {}

  async execute(input: UpdateCouponInput): Promise<UpdateCouponOutput> {
    const coupon = await this.couponRepository.findById(input.couponId);

    if (!coupon) {
      throw new CouponNotFoundError(input.couponId);
    }

    if (coupon.merchantId !== input.merchantId) {
      throw new CouponUnauthorizedError();
    }

    // Update coupon details
    coupon.updateDetails({
      description: input.description,
      percentage: input.percentage,
      amountCents: input.amountCents,
      maxRedemptions: input.maxRedemptions,
      expiresAt: input.expiresAt,
      active: input.active,
    });

    const updatedCoupon = await this.couponRepository.update(coupon);

    logger.info(
      {
        useCase: "UpdateCoupon",
        entityId: updatedCoupon.id,
        merchantId: input.merchantId,
      },
      "Coupon updated"
    );

    return { coupon: updatedCoupon };
  }
}

