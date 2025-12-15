import { Module } from "../../domain/entities/Module";

export interface ModuleRepository {
  findById(id: string): Promise<Module | null>;
  findByCourseId(courseId: string): Promise<Module[]>;
  create(module: Module): Promise<Module>;
  update(module: Module): Promise<Module>;
  delete(id: string): Promise<void>;
}

