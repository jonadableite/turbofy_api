import { Affiliation, AffiliationStatus } from "../../../domain/entities/Affiliation";
import { AffiliationRepository, AffiliationFilters } from "../../../ports/repositories/AffiliationRepository";
import { prisma } from "../prismaClient";
import { AffiliationStatus as PrismaAffiliationStatus } from "@prisma/client";

export class PrismaAffiliationRepository implements AffiliationRepository {
  private toPrismaStatus(status: AffiliationStatus): PrismaAffiliationStatus {
    const map: Record<AffiliationStatus, PrismaAffiliationStatus> = {
      [AffiliationStatus.PENDING]: PrismaAffiliationStatus.PENDING,
      [AffiliationStatus.APPROVED]: PrismaAffiliationStatus.APPROVED,
      [AffiliationStatus.REJECTED]: PrismaAffiliationStatus.REJECTED,
    };
    return map[status];
  }

  async create(affiliation: Affiliation): Promise<Affiliation> {
    const record = await prisma.affiliation.create({
      data: {
        id: affiliation.id,
        courseId: affiliation.courseId,
        userId: affiliation.userId,
        status: this.toPrismaStatus(affiliation.status),
        commissionPercent: affiliation.commissionPercent,
        salesCount: affiliation.salesCount,
        referralCode: affiliation.referralCode,
      },
    });
    return this.toDomain(record);
  }

  async update(affiliation: Affiliation): Promise<Affiliation> {
    const record = await prisma.affiliation.update({
      where: { id: affiliation.id },
      data: {
        status: this.toPrismaStatus(affiliation.status),
        commissionPercent: affiliation.commissionPercent,
        salesCount: affiliation.salesCount,
        referralCode: affiliation.referralCode,
        updatedAt: new Date(),
      },
    });
    return this.toDomain(record);
  }

  async findById(id: string): Promise<Affiliation | null> {
    const record = await prisma.affiliation.findUnique({ where: { id } });
    return record ? this.toDomain(record) : null;
  }

  async findByUserAndCourse(userId: string, courseId: string): Promise<Affiliation | null> {
    const record = await prisma.affiliation.findUnique({
      where: { courseId_userId: { courseId, userId } },
    });
    return record ? this.toDomain(record) : null;
  }

  async findByReferralCode(code: string): Promise<Affiliation | null> {
    const record = await prisma.affiliation.findUnique({ where: { referralCode: code } });
    return record ? this.toDomain(record) : null;
  }

  async list(filters: AffiliationFilters): Promise<Affiliation[]> {
    const records = await prisma.affiliation.findMany({
      where: {
        courseId: filters.courseId,
        userId: filters.userId,
        status: filters.status ? this.toPrismaStatus(filters.status) : undefined,
      },
      orderBy: { createdAt: "desc" },
    });
    return records.map((r) => this.toDomain(r));
  }

  private toDomainStatus(status: PrismaAffiliationStatus): AffiliationStatus {
    const map: Record<PrismaAffiliationStatus, AffiliationStatus> = {
      [PrismaAffiliationStatus.PENDING]: AffiliationStatus.PENDING,
      [PrismaAffiliationStatus.APPROVED]: AffiliationStatus.APPROVED,
      [PrismaAffiliationStatus.REJECTED]: AffiliationStatus.REJECTED,
    };
    return map[status];
  }

  private toDomain(record: {
    id: string;
    courseId: string;
    userId: string;
    status: PrismaAffiliationStatus;
    commissionPercent: number;
    salesCount: number;
    referralCode: string;
    createdAt: Date;
    updatedAt: Date;
  }): Affiliation {
    return Affiliation.fromPersistence({
      id: record.id,
      courseId: record.courseId,
      userId: record.userId,
      status: this.toDomainStatus(record.status),
      commissionPercent: record.commissionPercent,
      salesCount: record.salesCount,
      referralCode: record.referralCode,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }
}


