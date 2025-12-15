import { logger } from "../../infrastructure/logger";
import { CouponRepository } from "../../ports/repositories/CouponRepository";

/**
 * @security Validates coupon for checkout without exposing internal data
 * @performance Optimized single query
 * @maintainability Clean use case for coupon validation
 * @testability Dependencies injected for easy mocking
 */

interface ValidateCouponInput {
  code: string;
  merchantId: string;
  courseId?: string;
  originalAmountCents: number;
}

interface ValidateCouponOutput {
  valid: boolean;
  coupon?: {
    id: string;
    code: string;
    discountType: string;
    percentage?: number;
    amountCents?: number;
    discountAmountCents: number;
    finalAmountCents: number;
  };
  error?: string;
}

export class ValidateCoupon {
  constructor(private readonly couponRepository: CouponRepository) {}

  async execute(input: ValidateCouponInput): Promise<ValidateCouponOutput> {
    const coupon = await this.couponRepository.findByCode(
      input.code,
      input.merchantId
    );

    if (!coupon) {
      return {
        valid: false,
        error: "Cupom não encontrado",
      };
    }

    // Check if coupon is for a specific course
    if (input.courseId && coupon.courseId && coupon.courseId !== input.courseId) {
      return {
        valid: false,
        error: "Cupom não é válido para este produto",
      };
    }

    if (!coupon.active) {
      return {
        valid: false,
        error: "Cupom inativo",
      };
    }

    if (coupon.isExpired()) {
      return {
        valid: false,
        error: "Cupom expirado",
      };
    }

    if (coupon.hasReachedLimit()) {
      return {
        valid: false,
        error: "Cupom atingiu o limite de resgates",
      };
    }

    const discountAmountCents = coupon.calculateDiscount(input.originalAmountCents);
    const finalAmountCents = Math.max(0, input.originalAmountCents - discountAmountCents);

    logger.info(
      {
        useCase: "ValidateCoupon",
        code: input.code,
        merchantId: input.merchantId,
        valid: true,
        discountAmountCents,
      },
      "Coupon validated"
    );

    return {
      valid: true,
      coupon: {
        id: coupon.id,
        code: coupon.code,
        discountType: coupon.discountType,
        percentage: coupon.percentage,
        amountCents: coupon.amountCents,
        discountAmountCents,
        finalAmountCents,
      },
    };
  }
}

