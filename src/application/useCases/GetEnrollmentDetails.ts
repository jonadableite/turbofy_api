import { EnrollmentRepository } from '../../ports/repositories/EnrollmentRepository';
import { CourseRepository } from '../../ports/repositories/CourseRepository';
import { ModuleRepository } from '../../ports/repositories/ModuleRepository';
import { LessonRepository } from '../../ports/repositories/LessonRepository';
import { LessonProgressRepository } from '../../ports/repositories/LessonProgressRepository';
import { Enrollment } from '../../domain/entities/Enrollment';
import { Course } from '../../domain/entities/Course';
import { Module } from '../../domain/entities/Module';
import { Lesson } from '../../domain/entities/Lesson';
import { LessonProgress } from '../../domain/entities/LessonProgress';

interface GetEnrollmentDetailsInput {
  userId: string;
  courseId: string;
}

interface ModuleWithLessons {
  module: Module;
  lessons: Array<{
    lesson: Lesson;
    progress?: LessonProgress;
  }>;
}

interface GetEnrollmentDetailsOutput {
  enrollment: Enrollment;
  course: Course;
  modules: ModuleWithLessons[];
  overallProgress: number; // 0-100
}

export class GetEnrollmentDetails {
  constructor(
    private readonly enrollmentRepository: EnrollmentRepository,
    private readonly courseRepository: CourseRepository,
    private readonly moduleRepository: ModuleRepository,
    private readonly lessonRepository: LessonRepository,
    private readonly lessonProgressRepository: LessonProgressRepository
  ) {}

  async execute(
    input: GetEnrollmentDetailsInput
  ): Promise<GetEnrollmentDetailsOutput> {
    // Buscar matrícula ativa
    const enrollment =
      await this.enrollmentRepository.findByUserIdAndCourseId(
        input.userId,
        input.courseId
      );

    if (!enrollment) {
      throw new Error('Enrollment not found or not active');
    }

    // Buscar curso
    const course = await this.courseRepository.findById(
      input.courseId
    );

    if (!course) {
      throw new Error(`Course ${input.courseId} not found`);
    }

    // Buscar módulos e aulas
    const modules = await this.moduleRepository.findByCourseId(
      input.courseId
    );
    const modulesWithLessons: ModuleWithLessons[] = [];

    let totalLessons = 0;
    let completedLessons = 0;

    for (const module of modules) {
      const lessons =
        await this.lessonRepository.findPublishedByModuleId(
          module.id
        );
      const lessonsWithProgress: Array<{
        lesson: Lesson;
        progress?: LessonProgress;
      }> = [];

      for (const lesson of lessons) {
        totalLessons++;
        const progress =
          await this.lessonProgressRepository.findByEnrollmentIdAndLessonId(
            enrollment.id,
            lesson.id
          );

        if (progress && progress.isCompleted()) {
          completedLessons++;
        }

        lessonsWithProgress.push({
          lesson,
          progress: progress ?? undefined,
        });
      }

      modulesWithLessons.push({
        module,
        lessons: lessonsWithProgress,
      });
    }

    const overallProgress =
      totalLessons > 0
        ? Math.round((completedLessons / totalLessons) * 100)
        : 0;

    return {
      enrollment,
      course,
      modules: modulesWithLessons,
      overallProgress,
    };
  }
}
