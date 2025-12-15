import { Coupon, DiscountType } from "../../domain/entities/Coupon";
import { logger } from "../../infrastructure/logger";
import { CouponRepository } from "../../ports/repositories/CouponRepository";
import { CourseRepository } from "../../ports/repositories/CourseRepository";

/**
 * @security Validates merchant ownership before creating coupon
 * @performance Single transaction for coupon creation
 * @maintainability Clean use case with clear input/output
 * @testability Dependencies injected for easy mocking
 */

interface CreateCouponInput {
  merchantId: string;
  courseId: string;
  code: string;
  description?: string;
  discountType: DiscountType;
  percentage?: number;
  amountCents?: number;
  maxRedemptions?: number;
  expiresAt?: Date;
}

interface CreateCouponOutput {
  coupon: Coupon;
}

export class CourseNotFoundError extends Error {
  constructor(courseId: string) {
    super(`Curso não encontrado: ${courseId}`);
    this.name = "CourseNotFoundError";
  }
}

export class CourseUnauthorizedError extends Error {
  constructor() {
    super("Você não tem permissão para criar cupons neste curso");
    this.name = "CourseUnauthorizedError";
  }
}

export class CouponCodeExistsError extends Error {
  constructor(code: string) {
    super(`Já existe um cupom com o código: ${code}`);
    this.name = "CouponCodeExistsError";
  }
}

export class CreateCoupon {
  constructor(
    private readonly couponRepository: CouponRepository,
    private readonly courseRepository: CourseRepository
  ) {}

  async execute(input: CreateCouponInput): Promise<CreateCouponOutput> {
    // Validate course exists and belongs to merchant
    const course = await this.courseRepository.findById(input.courseId);
    
    if (!course) {
      throw new CourseNotFoundError(input.courseId);
    }

    if (course.merchantId !== input.merchantId) {
      throw new CourseUnauthorizedError();
    }

    // Check if coupon code already exists for this merchant
    const codeExists = await this.couponRepository.existsByCode(
      input.code,
      input.merchantId
    );

    if (codeExists) {
      throw new CouponCodeExistsError(input.code);
    }

    // Create coupon entity
    const coupon = Coupon.create({
      merchantId: input.merchantId,
      courseId: input.courseId,
      code: input.code,
      description: input.description,
      discountType: input.discountType,
      percentage: input.percentage,
      amountCents: input.amountCents,
      maxRedemptions: input.maxRedemptions,
      expiresAt: input.expiresAt,
    });

    // Persist coupon
    const savedCoupon = await this.couponRepository.create(coupon);

    logger.info(
      {
        useCase: "CreateCoupon",
        entityId: savedCoupon.id,
        merchantId: input.merchantId,
        courseId: input.courseId,
        code: savedCoupon.code,
      },
      "Coupon created"
    );

    return { coupon: savedCoupon };
  }
}

