import { LessonProgressRepository } from "../../../ports/repositories/LessonProgressRepository";
import { LessonProgress } from "../../../domain/entities/LessonProgress";
import { prisma } from "../prismaClient";

export class PrismaLessonProgressRepository implements LessonProgressRepository {
  async findById(id: string): Promise<LessonProgress | null> {
    const record = await prisma.lessonProgress.findUnique({
      where: { id },
    });

    if (!record) {
      return null;
    }

    return this.toDomain(record);
  }

  async findByEnrollmentId(enrollmentId: string): Promise<LessonProgress[]> {
    const records = await prisma.lessonProgress.findMany({
      where: { enrollmentId },
      orderBy: { updatedAt: "desc" },
    });

    return records.map((r) => this.toDomain(r));
  }

  async findByEnrollmentIdAndLessonId(enrollmentId: string, lessonId: string): Promise<LessonProgress | null> {
    const record = await prisma.lessonProgress.findUnique({
      where: {
        enrollmentId_lessonId: {
          enrollmentId,
          lessonId,
        },
      },
    });

    if (!record) {
      return null;
    }

    return this.toDomain(record);
  }

  async create(progress: LessonProgress): Promise<LessonProgress> {
    const record = await prisma.lessonProgress.create({
      data: {
        id: progress.id,
        enrollmentId: progress.enrollmentId,
        lessonId: progress.lessonId,
        progressPercent: progress.progressPercent,
        completedAt: progress.completedAt,
      },
    });

    return this.toDomain(record);
  }

  async update(progress: LessonProgress): Promise<LessonProgress> {
    const record = await prisma.lessonProgress.update({
      where: { id: progress.id },
      data: {
        progressPercent: progress.progressPercent,
        completedAt: progress.completedAt,
        updatedAt: new Date(),
      },
    });

    return this.toDomain(record);
  }

  private toDomain(record: {
    id: string;
    enrollmentId: string;
    lessonId: string;
    progressPercent: number;
    completedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): LessonProgress {
    return new LessonProgress({
      id: record.id,
      enrollmentId: record.enrollmentId,
      lessonId: record.lessonId,
      progressPercent: record.progressPercent,
      completedAt: record.completedAt ?? undefined,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }
}

