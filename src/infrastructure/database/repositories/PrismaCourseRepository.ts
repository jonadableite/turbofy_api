import { CourseRepository } from "../../../ports/repositories/CourseRepository";
import { Course, CourseStatus, AccessType } from "../../../domain/entities/Course";
import { prisma } from "../prismaClient";
import { CourseStatus as PrismaCourseStatus, AccessType as PrismaAccessType } from "@prisma/client";

export class PrismaCourseRepository implements CourseRepository {
  async findById(id: string): Promise<Course | null> {
    const record = await prisma.course.findUnique({
      where: { id },
    });

    if (!record) {
      return null;
    }

    return this.toDomain(record);
  }

  async findByMerchantId(merchantId: string): Promise<Course[]> {
    const records = await prisma.course.findMany({
      where: { merchantId },
      orderBy: { createdAt: "desc" },
    });

    return records.map((r) => this.toDomain(r));
  }

  async findPublishedByMerchantId(merchantId: string): Promise<Course[]> {
    const records = await prisma.course.findMany({
      where: {
        merchantId,
        status: PrismaCourseStatus.PUBLISHED,
      },
      orderBy: { createdAt: "desc" },
    });

    return records.map((r) => this.toDomain(r));
  }

  async findMarketplace(filters: {
    minCommissionPercent?: number;
    maxPriceCents?: number;
    minPriceCents?: number;
    categoryIds?: string[];
    search?: string;
  }): Promise<Course[]> {
    const records = await prisma.course.findMany({
      where: {
        marketplaceVisible: true,
        affiliateProgramEnabled: true,
        affiliateCommissionPercent: filters.minCommissionPercent
          ? { gte: filters.minCommissionPercent }
          : undefined,
        title: filters.search
          ? { contains: filters.search, mode: "insensitive" }
          : undefined,
        prices: {
          some: {
            active: true,
            amountCents: {
              gte: filters.minPriceCents,
              lte: filters.maxPriceCents,
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return records.map((r) => this.toDomain(r));
  }

  async create(course: Course): Promise<Course> {
    const record = await prisma.course.create({
      data: {
        id: course.id,
        merchantId: course.merchantId,
        title: course.title,
        description: course.description,
        thumbnailUrl: course.thumbnailUrl,
        status: this.toPrismaStatus(course.status),
        accessType: this.toPrismaAccessType(course.accessType),
        certificateText: course.certificateText,
        marketplaceVisible: course.marketplaceVisible,
        affiliateProgramEnabled: course.affiliateProgramEnabled,
        affiliateCommissionPercent: course.affiliateCommissionPercent,
        affiliateInviteToken: course.affiliateInviteToken,
      },
    });

    return this.toDomain(record);
  }

  async update(course: Course): Promise<Course> {
    const record = await prisma.course.update({
      where: { id: course.id },
      data: {
        title: course.title,
        description: course.description,
        thumbnailUrl: course.thumbnailUrl,
        status: this.toPrismaStatus(course.status),
        accessType: this.toPrismaAccessType(course.accessType),
        certificateText: course.certificateText,
        marketplaceVisible: course.marketplaceVisible,
        affiliateProgramEnabled: course.affiliateProgramEnabled,
        affiliateCommissionPercent: course.affiliateCommissionPercent,
        affiliateInviteToken: course.affiliateInviteToken,
        updatedAt: new Date(),
      },
    });

    return this.toDomain(record);
  }

  async delete(id: string): Promise<void> {
    await prisma.course.delete({
      where: { id },
    });
  }

  private toDomain(record: {
    id: string;
    merchantId: string;
    title: string;
    description: string | null;
    thumbnailUrl: string | null;
    status: PrismaCourseStatus;
    accessType: PrismaAccessType;
    certificateText: string | null;
    marketplaceVisible: boolean;
    affiliateProgramEnabled: boolean;
    affiliateCommissionPercent: number;
    affiliateInviteToken: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): Course {
    return new Course({
      id: record.id,
      merchantId: record.merchantId,
      title: record.title,
      description: record.description ?? undefined,
      thumbnailUrl: record.thumbnailUrl ?? undefined,
      status: this.toDomainStatus(record.status),
      accessType: this.toDomainAccessType(record.accessType),
      certificateText: record.certificateText ?? undefined,
      marketplaceVisible: record.marketplaceVisible,
      affiliateProgramEnabled: record.affiliateProgramEnabled,
      affiliateCommissionPercent: record.affiliateCommissionPercent,
      affiliateInviteToken: record.affiliateInviteToken ?? '',
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }

  private toPrismaStatus(status: CourseStatus): PrismaCourseStatus {
    const map: Record<CourseStatus, PrismaCourseStatus> = {
      [CourseStatus.DRAFT]: PrismaCourseStatus.DRAFT,
      [CourseStatus.PUBLISHED]: PrismaCourseStatus.PUBLISHED,
      [CourseStatus.ARCHIVED]: PrismaCourseStatus.ARCHIVED,
    };
    return map[status];
  }

  private toDomainStatus(status: PrismaCourseStatus): CourseStatus {
    const map: Record<PrismaCourseStatus, CourseStatus> = {
      [PrismaCourseStatus.DRAFT]: CourseStatus.DRAFT,
      [PrismaCourseStatus.PUBLISHED]: CourseStatus.PUBLISHED,
      [PrismaCourseStatus.ARCHIVED]: CourseStatus.ARCHIVED,
    };
    return map[status];
  }

  private toPrismaAccessType(type: AccessType): PrismaAccessType {
    const map: Record<AccessType, PrismaAccessType> = {
      [AccessType.LIFETIME]: PrismaAccessType.LIFETIME,
      [AccessType.SUBSCRIPTION]: PrismaAccessType.SUBSCRIPTION,
    };
    return map[type];
  }

  private toDomainAccessType(type: PrismaAccessType): AccessType {
    const map: Record<PrismaAccessType, AccessType> = {
      [PrismaAccessType.LIFETIME]: AccessType.LIFETIME,
      [PrismaAccessType.SUBSCRIPTION]: AccessType.SUBSCRIPTION,
    };
    return map[type];
  }
}

