import { Coupon } from "../../domain/entities/Coupon";
import { logger } from "../../infrastructure/logger";
import { CouponRepository, CouponStats } from "../../ports/repositories/CouponRepository";

/**
 * @security Filters coupons by merchant for data isolation
 * @performance Supports pagination and filtering
 * @maintainability Clean use case with typed filters
 * @testability Dependencies injected for easy mocking
 */

interface ListCouponsInput {
  merchantId: string;
  courseId?: string;
  active?: boolean;
  search?: string;
  limit?: number;
  offset?: number;
}

interface ListCouponsOutput {
  coupons: Coupon[];
  stats: CouponStats;
  total: number;
}

export class ListCoupons {
  constructor(private readonly couponRepository: CouponRepository) {}

  async execute(input: ListCouponsInput): Promise<ListCouponsOutput> {
    const [coupons, stats, total] = await Promise.all([
      this.couponRepository.findWithFilters({
        merchantId: input.merchantId,
        courseId: input.courseId,
        active: input.active,
        search: input.search,
        limit: input.limit ?? 50,
        offset: input.offset ?? 0,
      }),
      this.couponRepository.getStats(input.merchantId),
      this.couponRepository.countByMerchantId(input.merchantId),
    ]);

    logger.info(
      {
        useCase: "ListCoupons",
        merchantId: input.merchantId,
        count: coupons.length,
        total,
      },
      "Coupons listed"
    );

    return { coupons, stats, total };
  }
}

