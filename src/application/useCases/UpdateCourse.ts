import { CourseRepository } from "../../ports/repositories/CourseRepository";
import { Course, AccessType } from "../../domain/entities/Course";
import { logger } from "../../infrastructure/logger";

interface UpdateCourseInput {
  courseId: string;
  merchantId: string;
  title?: string;
  description?: string;
  thumbnailUrl?: string;
  accessType?: AccessType;
  certificateText?: string;
}

interface UpdateCourseOutput {
  course: Course;
}

export class UpdateCourse {
  constructor(private readonly courseRepository: CourseRepository) {}

  async execute(input: UpdateCourseInput): Promise<UpdateCourseOutput> {
    const course = await this.courseRepository.findById(input.courseId);

    if (!course) {
      throw new Error(`Course ${input.courseId} not found`);
    }

    // Verificar autorização: o curso pertence ao merchant?
    if (course.merchantId !== input.merchantId) {
      throw new Error("Unauthorized: course does not belong to this merchant");
    }

    course.updateDetails({
      title: input.title,
      description: input.description,
      thumbnailUrl: input.thumbnailUrl,
      accessType: input.accessType,
      certificateText: input.certificateText,
    });

    const updatedCourse = await this.courseRepository.update(course);

    logger.info(
      {
        useCase: "UpdateCourse",
        entityId: updatedCourse.id,
        merchantId: input.merchantId,
      },
      "Course updated"
    );

    return { course: updatedCourse };
  }
}

