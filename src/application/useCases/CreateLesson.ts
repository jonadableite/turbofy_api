import { LessonRepository } from "../../ports/repositories/LessonRepository";
import { ModuleRepository } from "../../ports/repositories/ModuleRepository";
import { CourseRepository } from "../../ports/repositories/CourseRepository";
import { Lesson, VideoProvider, DownloadableFile } from "../../domain/entities/Lesson";
import { logger } from "../../infrastructure/logger";

interface CreateLessonInput {
  moduleId: string;
  merchantId: string;
  title: string;
  videoProvider?: VideoProvider;
  videoKey?: string;
  contentHtml?: string;
  downloadableFiles?: DownloadableFile[];
}

interface CreateLessonOutput {
  lesson: Lesson;
}

export class CreateLesson {
  constructor(
    private readonly lessonRepository: LessonRepository,
    private readonly moduleRepository: ModuleRepository,
    private readonly courseRepository: CourseRepository
  ) {}

  async execute(input: CreateLessonInput): Promise<CreateLessonOutput> {
    // Verificar que o módulo existe
    const module = await this.moduleRepository.findById(input.moduleId);

    if (!module) {
      throw new Error(`Module ${input.moduleId} not found`);
    }

    // Verificar autorização via curso
    const course = await this.courseRepository.findById(module.courseId);

    if (!course) {
      throw new Error(`Course ${module.courseId} not found`);
    }

    if (course.merchantId !== input.merchantId) {
      throw new Error("Unauthorized: course does not belong to this merchant");
    }

    // Calcular próxima posição
    const existingLessons = await this.lessonRepository.findByModuleId(input.moduleId);
    const nextPosition = existingLessons.length;

    const lesson = Lesson.create({
      moduleId: input.moduleId,
      title: input.title,
      videoProvider: input.videoProvider,
      videoKey: input.videoKey,
      contentHtml: input.contentHtml,
      downloadableFiles: input.downloadableFiles,
      position: nextPosition,
    });

    const savedLesson = await this.lessonRepository.create(lesson);

    logger.info(
      {
        useCase: "CreateLesson",
        entityId: savedLesson.id,
        moduleId: input.moduleId,
      },
      "Lesson created"
    );

    return { lesson: savedLesson };
  }
}

