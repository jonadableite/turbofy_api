import { CourseRepository } from "../../ports/repositories/CourseRepository";
import { ModuleRepository } from "../../ports/repositories/ModuleRepository";
import { LessonRepository } from "../../ports/repositories/LessonRepository";
import { Course } from "../../domain/entities/Course";
import { logger } from "../../infrastructure/logger";

interface PublishCourseInput {
  courseId: string;
  merchantId: string;
}

interface PublishCourseOutput {
  course: Course;
}

export class PublishCourse {
  constructor(
    private readonly courseRepository: CourseRepository,
    private readonly moduleRepository: ModuleRepository,
    private readonly lessonRepository: LessonRepository
  ) {}

  async execute(input: PublishCourseInput): Promise<PublishCourseOutput> {
    const course = await this.courseRepository.findById(input.courseId);

    if (!course) {
      throw new Error(`Course ${input.courseId} not found`);
    }

    // Verificar autorização
    if (course.merchantId !== input.merchantId) {
      throw new Error("Unauthorized: course does not belong to this merchant");
    }

    // Validar que o curso tem conteúdo suficiente
    const modules = await this.moduleRepository.findByCourseId(input.courseId);

    if (modules.length === 0) {
      throw new Error("Cannot publish course: must have at least one module");
    }

    // Verificar que existe pelo menos uma aula publicada
    let hasPublishedLesson = false;
    for (const module of modules) {
      const publishedLessons = await this.lessonRepository.findPublishedByModuleId(module.id);
      if (publishedLessons.length > 0) {
        hasPublishedLesson = true;
        break;
      }
    }

    if (!hasPublishedLesson) {
      throw new Error("Cannot publish course: must have at least one published lesson");
    }

    course.publish();

    const publishedCourse = await this.courseRepository.update(course);

    logger.info(
      {
        useCase: "PublishCourse",
        entityId: publishedCourse.id,
        merchantId: input.merchantId,
      },
      "Course published"
    );

    return { course: publishedCourse };
  }
}

