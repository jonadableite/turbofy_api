import { Course } from "../../../domain/entities/Course";
import { CourseRepository } from "../../../ports/repositories/CourseRepository";

export interface ListMarketplaceCoursesInput {
  minCommissionPercent?: number;
  minPriceCents?: number;
  maxPriceCents?: number;
  categoryIds?: string[];
  search?: string;
}

export class ListMarketplaceCourses {
  constructor(private readonly courseRepository: CourseRepository) {}

  async execute(input: ListMarketplaceCoursesInput): Promise<Course[]> {
    return this.courseRepository.findMarketplace({
      minCommissionPercent: input.minCommissionPercent,
      minPriceCents: input.minPriceCents,
      maxPriceCents: input.maxPriceCents,
      categoryIds: input.categoryIds,
      search: input.search,
    });
  }
}


