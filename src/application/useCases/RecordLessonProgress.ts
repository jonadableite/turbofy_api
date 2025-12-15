import { LessonProgressRepository } from "../../ports/repositories/LessonProgressRepository";
import { EnrollmentRepository } from "../../ports/repositories/EnrollmentRepository";
import { LessonRepository } from "../../ports/repositories/LessonRepository";
import { LessonProgress } from "../../domain/entities/LessonProgress";
import { logger } from "../../infrastructure/logger";

interface RecordLessonProgressInput {
  userId: string;
  enrollmentId: string;
  lessonId: string;
  progressPercent: number;
}

interface RecordLessonProgressOutput {
  progress: LessonProgress;
}

export class RecordLessonProgress {
  constructor(
    private readonly lessonProgressRepository: LessonProgressRepository,
    private readonly enrollmentRepository: EnrollmentRepository,
    private readonly lessonRepository: LessonRepository
  ) {}

  async execute(input: RecordLessonProgressInput): Promise<RecordLessonProgressOutput> {
    // Validar que a matrícula existe e pertence ao usuário
    const enrollment = await this.enrollmentRepository.findById(input.enrollmentId);

    if (!enrollment) {
      throw new Error(`Enrollment ${input.enrollmentId} not found`);
    }

    if (enrollment.userId !== input.userId) {
      throw new Error("Unauthorized: enrollment does not belong to this user");
    }

    if (!enrollment.isActive()) {
      throw new Error("Enrollment is not active");
    }

    // Validar que a aula existe
    const lesson = await this.lessonRepository.findById(input.lessonId);

    if (!lesson) {
      throw new Error(`Lesson ${input.lessonId} not found`);
    }

    // Buscar progresso existente
    let progress = await this.lessonProgressRepository.findByEnrollmentIdAndLessonId(
      input.enrollmentId,
      input.lessonId
    );

    if (progress) {
      // Atualizar progresso existente
      progress.updateProgress(input.progressPercent);
      progress = await this.lessonProgressRepository.update(progress);
    } else {
      // Criar novo progresso
      progress = LessonProgress.create({
        enrollmentId: input.enrollmentId,
        lessonId: input.lessonId,
        progressPercent: input.progressPercent,
      });
      progress = await this.lessonProgressRepository.create(progress);
    }

    logger.info(
      {
        useCase: "RecordLessonProgress",
        entityId: progress.id,
        enrollmentId: input.enrollmentId,
        lessonId: input.lessonId,
        progressPercent: input.progressPercent,
      },
      "Lesson progress recorded"
    );

    return { progress };
  }
}

