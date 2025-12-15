import { ModuleRepository } from "../../ports/repositories/ModuleRepository";
import { CourseRepository } from "../../ports/repositories/CourseRepository";
import { Module } from "../../domain/entities/Module";
import { logger } from "../../infrastructure/logger";

interface CreateModuleInput {
  courseId: string;
  merchantId: string;
  title: string;
}

interface CreateModuleOutput {
  module: Module;
}

export class CreateModule {
  constructor(
    private readonly moduleRepository: ModuleRepository,
    private readonly courseRepository: CourseRepository
  ) {}

  async execute(input: CreateModuleInput): Promise<CreateModuleOutput> {
    // Verificar que o curso existe e pertence ao merchant
    const course = await this.courseRepository.findById(input.courseId);

    if (!course) {
      throw new Error(`Course ${input.courseId} not found`);
    }

    if (course.merchantId !== input.merchantId) {
      throw new Error("Unauthorized: course does not belong to this merchant");
    }

    // Calcular próxima posição
    const existingModules = await this.moduleRepository.findByCourseId(input.courseId);
    const nextPosition = existingModules.length;

    const module = Module.create({
      courseId: input.courseId,
      title: input.title,
      position: nextPosition,
    });

    const savedModule = await this.moduleRepository.create(module);

    logger.info(
      {
        useCase: "CreateModule",
        entityId: savedModule.id,
        courseId: input.courseId,
      },
      "Module created"
    );

    return { module: savedModule };
  }
}

