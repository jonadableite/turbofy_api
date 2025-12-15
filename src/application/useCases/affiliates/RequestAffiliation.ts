import { Affiliation } from "../../../domain/entities/Affiliation";
import { Course } from "../../../domain/entities/Course";
import { AffiliationRepository } from "../../../ports/repositories/AffiliationRepository";
import { CourseRepository } from "../../../ports/repositories/CourseRepository";

export interface RequestAffiliationInput {
  courseId: string;
  userId: string;
  autoApprove?: boolean;
  commissionPercentOverride?: number;
}

export class RequestAffiliation {
  constructor(
    private readonly courseRepository: CourseRepository,
    private readonly affiliationRepository: AffiliationRepository
  ) {}

  async execute(input: RequestAffiliationInput): Promise<Affiliation> {
    const course = await this.courseRepository.findById(input.courseId);
    if (!course) {
      throw new Error("Curso não encontrado");
    }
    if (!course.affiliateProgramEnabled) {
      throw new Error("Programa de afiliados não habilitado para este produto");
    }

    const existing = await this.affiliationRepository.findByUserAndCourse(
      input.userId,
      input.courseId
    );
    if (existing) {
      return existing;
    }

    const commissionPercent =
      input.commissionPercentOverride ?? course.affiliateCommissionPercent;

    const affiliation = Affiliation.create({
      courseId: input.courseId,
      userId: input.userId,
      commissionPercent,
      autoApproved: input.autoApprove ?? false,
    });

    const saved = await this.affiliationRepository.create(affiliation);
    return saved;
  }
}


