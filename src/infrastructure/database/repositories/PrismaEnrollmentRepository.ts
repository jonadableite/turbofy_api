import { EnrollmentRepository } from "../../../ports/repositories/EnrollmentRepository";
import { Enrollment, EnrollmentStatus } from "../../../domain/entities/Enrollment";
import { prisma } from "../prismaClient";
import { EnrollmentStatus as PrismaEnrollmentStatus } from "@prisma/client";

export class PrismaEnrollmentRepository implements EnrollmentRepository {
  async findById(id: string): Promise<Enrollment | null> {
    const record = await prisma.enrollment.findUnique({
      where: { id },
    });

    if (!record) {
      return null;
    }

    return this.toDomain(record);
  }

  async findByUserId(userId: string): Promise<Enrollment[]> {
    const records = await prisma.enrollment.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });

    return records.map((r) => this.toDomain(r));
  }

  async findByCourseId(courseId: string): Promise<Enrollment[]> {
    const records = await prisma.enrollment.findMany({
      where: { courseId },
      orderBy: { createdAt: "desc" },
    });

    return records.map((r) => this.toDomain(r));
  }

  async findByUserIdAndCourseId(userId: string, courseId: string): Promise<Enrollment | null> {
    const record = await prisma.enrollment.findFirst({
      where: {
        userId,
        courseId,
        status: PrismaEnrollmentStatus.ACTIVE,
      },
    });

    if (!record) {
      return null;
    }

    return this.toDomain(record);
  }

  async findByChargeId(chargeId: string): Promise<Enrollment | null> {
    const record = await prisma.enrollment.findUnique({
      where: { chargeId },
    });

    if (!record) {
      return null;
    }

    return this.toDomain(record);
  }

  async create(enrollment: Enrollment): Promise<Enrollment> {
    const record = await prisma.enrollment.create({
      data: {
        id: enrollment.id,
        courseId: enrollment.courseId,
        userId: enrollment.userId,
        chargeId: enrollment.chargeId,
        status: this.toPrismaStatus(enrollment.status),
        accessDate: enrollment.accessDate,
        revokedAt: enrollment.revokedAt,
      },
    });

    return this.toDomain(record);
  }

  async update(enrollment: Enrollment): Promise<Enrollment> {
    const record = await prisma.enrollment.update({
      where: { id: enrollment.id },
      data: {
        status: this.toPrismaStatus(enrollment.status),
        revokedAt: enrollment.revokedAt,
        updatedAt: new Date(),
      },
    });

    return this.toDomain(record);
  }

  private toDomain(record: {
    id: string;
    courseId: string;
    userId: string;
    chargeId: string;
    status: PrismaEnrollmentStatus;
    accessDate: Date;
    revokedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): Enrollment {
    return new Enrollment({
      id: record.id,
      courseId: record.courseId,
      userId: record.userId,
      chargeId: record.chargeId,
      status: this.toDomainStatus(record.status),
      accessDate: record.accessDate,
      revokedAt: record.revokedAt ?? undefined,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }

  private toPrismaStatus(status: EnrollmentStatus): PrismaEnrollmentStatus {
    const map: Record<EnrollmentStatus, PrismaEnrollmentStatus> = {
      [EnrollmentStatus.ACTIVE]: PrismaEnrollmentStatus.ACTIVE,
      [EnrollmentStatus.REFUNDED]: PrismaEnrollmentStatus.REFUNDED,
      [EnrollmentStatus.REVOKED]: PrismaEnrollmentStatus.REVOKED,
    };
    return map[status];
  }

  private toDomainStatus(status: PrismaEnrollmentStatus): EnrollmentStatus {
    const map: Record<PrismaEnrollmentStatus, EnrollmentStatus> = {
      [PrismaEnrollmentStatus.ACTIVE]: EnrollmentStatus.ACTIVE,
      [PrismaEnrollmentStatus.REFUNDED]: EnrollmentStatus.REFUNDED,
      [PrismaEnrollmentStatus.REVOKED]: EnrollmentStatus.REVOKED,
    };
    return map[status];
  }
}

