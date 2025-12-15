import { LessonProgress } from "../../domain/entities/LessonProgress";

export interface LessonProgressRepository {
  findById(id: string): Promise<LessonProgress | null>;
  findByEnrollmentId(enrollmentId: string): Promise<LessonProgress[]>;
  findByEnrollmentIdAndLessonId(enrollmentId: string, lessonId: string): Promise<LessonProgress | null>;
  create(progress: LessonProgress): Promise<LessonProgress>;
  update(progress: LessonProgress): Promise<LessonProgress>;
}

