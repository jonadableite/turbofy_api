import { LessonRepository } from "../../ports/repositories/LessonRepository";
import { ModuleRepository } from "../../ports/repositories/ModuleRepository";
import { CourseRepository } from "../../ports/repositories/CourseRepository";
import { Lesson, VideoProvider, DownloadableFile } from "../../domain/entities/Lesson";
import { logger } from "../../infrastructure/logger";

interface UpdateLessonInput {
  lessonId: string;
  merchantId: string;
  title?: string;
  videoProvider?: VideoProvider;
  videoKey?: string;
  contentHtml?: string;
  downloadableFiles?: DownloadableFile[];
  isPublished?: boolean;
}

interface UpdateLessonOutput {
  lesson: Lesson;
}

export class UpdateLesson {
  constructor(
    private readonly lessonRepository: LessonRepository,
    private readonly moduleRepository: ModuleRepository,
    private readonly courseRepository: CourseRepository
  ) {}

  async execute(input: UpdateLessonInput): Promise<UpdateLessonOutput> {
    const lesson = await this.lessonRepository.findById(input.lessonId);

    if (!lesson) {
      throw new Error(`Lesson ${input.lessonId} not found`);
    }

    // Verificar autorização via módulo → curso
    const module = await this.moduleRepository.findById(lesson.moduleId);

    if (!module) {
      throw new Error(`Module ${lesson.moduleId} not found`);
    }

    const course = await this.courseRepository.findById(module.courseId);

    if (!course) {
      throw new Error(`Course ${module.courseId} not found`);
    }

    if (course.merchantId !== input.merchantId) {
      throw new Error("Unauthorized: course does not belong to this merchant");
    }

    lesson.updateContent({
      title: input.title,
      videoProvider: input.videoProvider,
      videoKey: input.videoKey,
      contentHtml: input.contentHtml,
      downloadableFiles: input.downloadableFiles,
    });

    // Atualizar status de publicação se fornecido
    if (input.isPublished !== undefined) {
      if (input.isPublished && !lesson.isPublished) {
        lesson.publish();
      } else if (!input.isPublished && lesson.isPublished) {
        lesson.unpublish();
      }
    }

    const updatedLesson = await this.lessonRepository.update(lesson);

    logger.info(
      {
        useCase: "UpdateLesson",
        entityId: updatedLesson.id,
      },
      "Lesson updated"
    );

    return { lesson: updatedLesson };
  }
}

