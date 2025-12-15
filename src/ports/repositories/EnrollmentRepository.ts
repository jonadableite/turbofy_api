import { Enrollment } from "../../domain/entities/Enrollment";

export interface EnrollmentRepository {
  findById(id: string): Promise<Enrollment | null>;
  findByUserId(userId: string): Promise<Enrollment[]>;
  findByCourseId(courseId: string): Promise<Enrollment[]>;
  findByUserIdAndCourseId(userId: string, courseId: string): Promise<Enrollment | null>;
  findByChargeId(chargeId: string): Promise<Enrollment | null>;
  create(enrollment: Enrollment): Promise<Enrollment>;
  update(enrollment: Enrollment): Promise<Enrollment>;
}

