import { ModuleRepository } from "../../../ports/repositories/ModuleRepository";
import { Module } from "../../../domain/entities/Module";
import { prisma } from "../prismaClient";

export class PrismaModuleRepository implements ModuleRepository {
  async findById(id: string): Promise<Module | null> {
    const record = await prisma.module.findUnique({
      where: { id },
    });

    if (!record) {
      return null;
    }

    return this.toDomain(record);
  }

  async findByCourseId(courseId: string): Promise<Module[]> {
    const records = await prisma.module.findMany({
      where: { courseId },
      orderBy: { position: "asc" },
    });

    return records.map((r) => this.toDomain(r));
  }

  async create(module: Module): Promise<Module> {
    const record = await prisma.module.create({
      data: {
        id: module.id,
        courseId: module.courseId,
        title: module.title,
        position: module.position,
      },
    });

    return this.toDomain(record);
  }

  async update(module: Module): Promise<Module> {
    const record = await prisma.module.update({
      where: { id: module.id },
      data: {
        title: module.title,
        position: module.position,
        updatedAt: new Date(),
      },
    });

    return this.toDomain(record);
  }

  async delete(id: string): Promise<void> {
    await prisma.module.delete({
      where: { id },
    });
  }

  private toDomain(record: {
    id: string;
    courseId: string;
    title: string;
    position: number;
    createdAt: Date;
    updatedAt: Date;
  }): Module {
    return new Module({
      id: record.id,
      courseId: record.courseId,
      title: record.title,
      position: record.position,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }
}

