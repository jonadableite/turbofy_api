import { logger } from "../../infrastructure/logger";
import { CouponRepository } from "../../ports/repositories/CouponRepository";

/**
 * @security Validates merchant ownership before deletion
 * @performance Single transaction for deletion
 * @maintainability Clean use case with clear error handling
 * @testability Dependencies injected for easy mocking
 */

interface DeleteCouponInput {
  couponId: string;
  merchantId: string;
}

export class CouponNotFoundError extends Error {
  constructor(couponId: string) {
    super(`Cupom não encontrado: ${couponId}`);
    this.name = "CouponNotFoundError";
  }
}

export class CouponUnauthorizedError extends Error {
  constructor() {
    super("Você não tem permissão para excluir este cupom");
    this.name = "CouponUnauthorizedError";
  }
}

export class DeleteCoupon {
  constructor(private readonly couponRepository: CouponRepository) {}

  async execute(input: DeleteCouponInput): Promise<void> {
    const coupon = await this.couponRepository.findById(input.couponId);

    if (!coupon) {
      throw new CouponNotFoundError(input.couponId);
    }

    if (coupon.merchantId !== input.merchantId) {
      throw new CouponUnauthorizedError();
    }

    await this.couponRepository.delete(input.couponId);

    logger.info(
      {
        useCase: "DeleteCoupon",
        entityId: input.couponId,
        merchantId: input.merchantId,
      },
      "Coupon deleted"
    );
  }
}

