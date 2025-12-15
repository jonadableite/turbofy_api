import { Coupon } from "../../domain/entities/Coupon";

/**
 * @security Repository interface for coupon data access
 * @performance Defines optimized query methods
 * @maintainability Decouples domain from infrastructure
 * @testability Easy to mock for unit tests
 */

export interface CouponStats {
  totalDiscountCents: number;
  totalRedemptions: number;
  activeCoupons: number;
}

export interface CouponFilters {
  merchantId: string;
  courseId?: string;
  active?: boolean;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface CouponRepository {
  findById(id: string): Promise<Coupon | null>;
  findByCode(code: string, merchantId: string): Promise<Coupon | null>;
  findByMerchantId(merchantId: string): Promise<Coupon[]>;
  findByCourseId(courseId: string): Promise<Coupon[]>;
  findWithFilters(filters: CouponFilters): Promise<Coupon[]>;
  countByMerchantId(merchantId: string): Promise<number>;
  getStats(merchantId: string): Promise<CouponStats>;
  create(coupon: Coupon): Promise<Coupon>;
  update(coupon: Coupon): Promise<Coupon>;
  delete(id: string): Promise<void>;
  existsByCode(code: string, merchantId: string, excludeId?: string): Promise<boolean>;
}

