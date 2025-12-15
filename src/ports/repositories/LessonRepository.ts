import { Lesson } from "../../domain/entities/Lesson";

export interface LessonRepository {
  findById(id: string): Promise<Lesson | null>;
  findByModuleId(moduleId: string): Promise<Lesson[]>;
  findPublishedByModuleId(moduleId: string): Promise<Lesson[]>;
  create(lesson: Lesson): Promise<Lesson>;
  update(lesson: Lesson): Promise<Lesson>;
  delete(id: string): Promise<void>;
}

