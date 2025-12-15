import { CoursePriceRepository, CoursePriceRecord, PriceType } from "../../../ports/repositories/CoursePriceRepository";
import { prisma } from "../prismaClient";
import { PriceType as PrismaPriceType } from "@prisma/client";

export class PrismaCoursePriceRepository implements CoursePriceRepository {
  async findById(id: string): Promise<CoursePriceRecord | null> {
    const record = await prisma.coursePrice.findUnique({
      where: { id },
    });

    if (!record) {
      return null;
    }

    return this.toRecord(record);
  }

  async findByCourseId(courseId: string): Promise<CoursePriceRecord[]> {
    const records = await prisma.coursePrice.findMany({
      where: { courseId },
      orderBy: { createdAt: "desc" },
    });

    return records.map((r) => this.toRecord(r));
  }

  async findActiveByCourseId(courseId: string): Promise<CoursePriceRecord | null> {
    const record = await prisma.coursePrice.findFirst({
      where: {
        courseId,
        active: true,
      },
      orderBy: { createdAt: "desc" },
    });

    if (!record) {
      return null;
    }

    return this.toRecord(record);
  }

  async create(data: {
    courseId: string;
    type: PriceType;
    amountCents: number;
    currency: string;
    recurrenceInterval?: string;
    active: boolean;
  }): Promise<CoursePriceRecord> {
    const record = await prisma.coursePrice.create({
      data: {
        courseId: data.courseId,
        type: this.toPrismaPriceType(data.type),
        amountCents: data.amountCents,
        currency: data.currency,
        recurrenceInterval: data.recurrenceInterval,
        active: data.active,
      },
    });

    return this.toRecord(record);
  }

  async update(
    id: string,
    data: {
      type?: PriceType;
      amountCents?: number;
      currency?: string;
      recurrenceInterval?: string;
      active?: boolean;
    }
  ): Promise<CoursePriceRecord> {
    const record = await prisma.coursePrice.update({
      where: { id },
      data: {
        type: data.type ? this.toPrismaPriceType(data.type) : undefined,
        amountCents: data.amountCents,
        currency: data.currency,
        recurrenceInterval: data.recurrenceInterval,
        active: data.active,
        updatedAt: new Date(),
      },
    });

    return this.toRecord(record);
  }

  private toRecord(record: {
    id: string;
    courseId: string;
    type: PrismaPriceType;
    amountCents: number;
    currency: string;
    recurrenceInterval: string | null;
    active: boolean;
    createdAt: Date;
    updatedAt: Date;
  }): CoursePriceRecord {
    return {
      id: record.id,
      courseId: record.courseId,
      type: this.toDomainPriceType(record.type),
      amountCents: record.amountCents,
      currency: record.currency,
      recurrenceInterval: record.recurrenceInterval ?? undefined,
      active: record.active,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  private toPrismaPriceType(type: PriceType): PrismaPriceType {
    const map: Record<PriceType, PrismaPriceType> = {
      [PriceType.ONE_TIME]: PrismaPriceType.ONE_TIME,
      [PriceType.SUBSCRIPTION]: PrismaPriceType.SUBSCRIPTION,
    };
    return map[type];
  }

  private toDomainPriceType(type: PrismaPriceType): PriceType {
    const map: Record<PrismaPriceType, PriceType> = {
      [PrismaPriceType.ONE_TIME]: PriceType.ONE_TIME,
      [PrismaPriceType.SUBSCRIPTION]: PriceType.SUBSCRIPTION,
    };
    return map[type];
  }
}

