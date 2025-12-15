import { Course } from "../../domain/entities/Course";

export interface CourseRepository {
  findById(id: string): Promise<Course | null>;
  findByMerchantId(merchantId: string): Promise<Course[]>;
  findPublishedByMerchantId(merchantId: string): Promise<Course[]>;
  findMarketplace(filters: {
    minCommissionPercent?: number;
    maxPriceCents?: number;
    minPriceCents?: number;
    categoryIds?: string[]; // placeholder for future taxonomy
    search?: string;
  }): Promise<Course[]>;
  create(course: Course): Promise<Course>;
  update(course: Course): Promise<Course>;
  delete(id: string): Promise<void>;
}

