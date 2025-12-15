import { CoProducer } from "../../../domain/entities/CoProducer";
import { CoProducerRepository } from "../../../ports/repositories/CoProducerRepository";
import { prisma } from "../prismaClient";

export class PrismaCoProducerRepository implements CoProducerRepository {
  async create(coProducer: CoProducer): Promise<CoProducer> {
    const record = await prisma.coProducer.create({
      data: {
        id: coProducer.id,
        courseId: coProducer.courseId,
        userId: coProducer.userId,
        commissionPercent: coProducer.commissionPercent,
      },
    });
    return this.toDomain(record);
  }

  async update(coProducer: CoProducer): Promise<CoProducer> {
    const record = await prisma.coProducer.update({
      where: { courseId_userId: { courseId: coProducer.courseId, userId: coProducer.userId } },
      data: {
        commissionPercent: coProducer.commissionPercent,
        updatedAt: new Date(),
      },
    });
    return this.toDomain(record);
  }

  async listByCourse(courseId: string): Promise<CoProducer[]> {
    const records = await prisma.coProducer.findMany({
      where: { courseId },
      orderBy: { createdAt: "desc" },
    });
    return records.map((r) => this.toDomain(r));
  }

  async findByCourseAndUser(courseId: string, userId: string): Promise<CoProducer | null> {
    const record = await prisma.coProducer.findUnique({
      where: { courseId_userId: { courseId, userId } },
    });
    return record ? this.toDomain(record) : null;
  }

  async deleteByCourseAndUser(courseId: string, userId: string): Promise<void> {
    await prisma.coProducer.delete({
      where: { courseId_userId: { courseId, userId } },
    });
  }

  private toDomain(record: {
    id: string;
    courseId: string;
    userId: string;
    commissionPercent: number;
    createdAt: Date;
    updatedAt: Date;
  }): CoProducer {
    return new CoProducer({
      id: record.id,
      courseId: record.courseId,
      userId: record.userId,
      commissionPercent: record.commissionPercent,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }
}


