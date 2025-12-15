import { CourseRepository } from "../../ports/repositories/CourseRepository";
import { Course, AccessType } from "../../domain/entities/Course";
import { logger } from "../../infrastructure/logger";

interface CreateCourseInput {
  merchantId: string;
  title: string;
  description?: string;
  thumbnailUrl?: string;
  accessType?: AccessType;
  certificateText?: string;
  marketplaceVisible?: boolean;
  affiliateProgramEnabled?: boolean;
  affiliateCommissionPercent?: number;
  affiliateInviteToken?: string;
}

interface CreateCourseOutput {
  course: Course;
}

export class CreateCourse {
  constructor(private readonly courseRepository: CourseRepository) {}

  async execute(input: CreateCourseInput): Promise<CreateCourseOutput> {
    const course = Course.create({
      merchantId: input.merchantId,
      title: input.title,
      description: input.description,
      thumbnailUrl: input.thumbnailUrl,
      accessType: input.accessType,
      certificateText: input.certificateText,
      marketplaceVisible: input.marketplaceVisible,
      affiliateProgramEnabled: input.affiliateProgramEnabled,
      affiliateCommissionPercent: input.affiliateCommissionPercent,
      affiliateInviteToken: input.affiliateInviteToken,
    });

    const savedCourse = await this.courseRepository.create(course);

    logger.info(
      {
        useCase: "CreateCourse",
        entityId: savedCourse.id,
        merchantId: input.merchantId,
      },
      "Course created"
    );

    return { course: savedCourse };
  }
}

