import { Prisma } from "@prisma/client";
import { Coupon, DiscountType } from "../../../domain/entities/Coupon";
import { CouponFilters, CouponRepository, CouponStats } from "../../../ports/repositories/CouponRepository";
import { prisma } from "../prismaClient";

/**
 * @security Implements secure data access patterns
 * @performance Uses optimized Prisma queries with indexes
 * @maintainability Follows repository pattern for data access
 * @testability Can be mocked for unit tests
 */

// Use Prisma generated type with course relation
type CouponWithCourse = Prisma.CouponGetPayload<{
  include: { course: { select: { merchantId: true } } };
}>;

export class PrismaCouponRepository implements CouponRepository {
  async findById(id: string): Promise<Coupon | null> {
    const record = await prisma.coupon.findUnique({
      where: { id },
      include: {
        course: {
          select: { merchantId: true },
        },
      },
    });

    if (!record) {
      return null;
    }

    return this.toDomain(record as CouponWithCourse);
  }

  async findByCode(code: string, merchantId: string): Promise<Coupon | null> {
    const record = await prisma.coupon.findFirst({
      where: {
        code: code.toUpperCase(),
        course: {
          merchantId,
        },
      },
      include: {
        course: {
          select: { merchantId: true },
        },
      },
    });

    if (!record) {
      return null;
    }

    return this.toDomain(record);
  }

  async findByCodeAndCourseId(code: string, courseId: string): Promise<Coupon | null> {
    const record = await prisma.coupon.findFirst({
      where: {
        code: code.toUpperCase(),
        courseId,
      },
      include: {
        course: {
          select: { merchantId: true },
        },
      },
    });

    if (!record) {
      return null;
    }

    return this.toDomain(record);
  }

  async incrementRedemptions(id: string): Promise<void> {
    await prisma.coupon.update({
      where: { id },
      data: {
        redemptions: {
          increment: 1,
        },
      },
    });
  }

  async findByMerchantId(merchantId: string): Promise<Coupon[]> {
    const records = await prisma.coupon.findMany({
      where: {
        course: {
          merchantId,
        },
      },
      include: {
        course: {
          select: { merchantId: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return records.map((r) => this.toDomain(r));
  }

  async findByCourseId(courseId: string): Promise<Coupon[]> {
    const records = await prisma.coupon.findMany({
      where: { courseId },
      include: {
        course: {
          select: { merchantId: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return records.map((r) => this.toDomain(r));
  }

  async findWithFilters(filters: CouponFilters): Promise<Coupon[]> {
    const where: Prisma.CouponWhereInput = {
      course: {
        merchantId: filters.merchantId,
      },
    };

    if (filters.courseId) {
      where.courseId = filters.courseId;
    }

    if (filters.active !== undefined) {
      where.active = filters.active;
    }

    if (filters.search) {
      where.code = {
        contains: filters.search.toUpperCase(),
        mode: "insensitive",
      };
    }

    const records = await prisma.coupon.findMany({
      where,
      include: {
        course: {
          select: { merchantId: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: filters.limit ?? 50,
      skip: filters.offset ?? 0,
    });

    return records.map((r) => this.toDomain(r));
  }

  async countByMerchantId(merchantId: string): Promise<number> {
    return prisma.coupon.count({
      where: {
        course: {
          merchantId,
        },
      },
    });
  }

  async getStats(merchantId: string): Promise<CouponStats> {
    const coupons = await prisma.coupon.findMany({
      where: {
        course: {
          merchantId,
        },
      },
      select: {
        percentage: true,
        amountCents: true,
        redemptions: true,
        active: true,
      },
    });

    const totalRedemptions = coupons.reduce((sum, c) => sum + c.redemptions, 0);
    const activeCoupons = coupons.filter((c) => c.active).length;

    // Calculate total discount given (simplified estimation)
    // In production, this should be calculated from actual transactions
    const totalDiscountCents = coupons.reduce((sum, c) => {
      if (c.amountCents && c.redemptions > 0) {
        return sum + c.amountCents * c.redemptions;
      }
      return sum;
    }, 0);

    return {
      totalDiscountCents,
      totalRedemptions,
      activeCoupons,
    };
  }

  async create(coupon: Coupon): Promise<Coupon> {
    // For now, we need a courseId. In future, we can make it optional for global coupons
    if (!coupon.courseId) {
      throw new Error("courseId is required for coupon creation");
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const createData: any = {
      id: coupon.id,
      courseId: coupon.courseId!,
      code: coupon.code,
      description: coupon.description ?? null,
      percentage: coupon.discountType === DiscountType.PERCENTAGE ? coupon.percentage : null,
      amountCents: coupon.discountType === DiscountType.FIXED ? coupon.amountCents : null,
      maxRedemptions: coupon.maxRedemptions ?? null,
      redemptions: coupon.redemptions,
      expiresAt: coupon.expiresAt ?? null,
      active: coupon.active,
    };

    const record = await prisma.coupon.create({
      data: createData,
      include: {
        course: {
          select: { merchantId: true },
        },
      },
    });

    return this.toDomain(record as CouponWithCourse);
  }

  async update(coupon: Coupon): Promise<Coupon> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: any = {
      description: coupon.description ?? null,
      percentage: coupon.discountType === DiscountType.PERCENTAGE ? coupon.percentage : null,
      amountCents: coupon.discountType === DiscountType.FIXED ? coupon.amountCents : null,
      maxRedemptions: coupon.maxRedemptions ?? null,
      redemptions: coupon.redemptions,
      expiresAt: coupon.expiresAt ?? null,
      active: coupon.active,
      updatedAt: new Date(),
    };

    const record = await prisma.coupon.update({
      where: { id: coupon.id },
      data: updateData,
      include: {
        course: {
          select: { merchantId: true },
        },
      },
    });

    return this.toDomain(record as CouponWithCourse);
  }

  async delete(id: string): Promise<void> {
    await prisma.coupon.delete({
      where: { id },
    });
  }

  async existsByCode(code: string, merchantId: string, excludeId?: string): Promise<boolean> {
    const count = await prisma.coupon.count({
      where: {
        code: code.toUpperCase(),
        course: {
          merchantId,
        },
        ...(excludeId && { id: { not: excludeId } }),
      },
    });

    return count > 0;
  }

  private toDomain(record: CouponWithCourse): Coupon {
    const discountType = record.percentage !== null ? DiscountType.PERCENTAGE : DiscountType.FIXED;
    // Type assertion needed because Prisma types may not include description until migration is run
    const recordWithDescription = record as CouponWithCourse & { description?: string | null };

    return new Coupon({
      id: record.id,
      merchantId: record.course.merchantId,
      courseId: record.courseId,
      code: record.code,
      description: recordWithDescription.description ?? undefined,
      discountType,
      percentage: record.percentage ?? undefined,
      amountCents: record.amountCents ?? undefined,
      maxRedemptions: record.maxRedemptions ?? undefined,
      redemptions: record.redemptions,
      expiresAt: record.expiresAt ?? undefined,
      active: record.active,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }
}

