import { CoursePriceRepository, PriceType, CoursePriceRecord } from "../../ports/repositories/CoursePriceRepository";
import { CourseRepository } from "../../ports/repositories/CourseRepository";
import { logger } from "../../infrastructure/logger";

interface UpsertCoursePriceInput {
  courseId: string;
  merchantId: string;
  type: PriceType;
  amountCents: number;
  currency?: string;
  recurrenceInterval?: string;
}

interface UpsertCoursePriceOutput {
  price: CoursePriceRecord;
}

export class UpsertCoursePrice {
  constructor(
    private readonly coursePriceRepository: CoursePriceRepository,
    private readonly courseRepository: CourseRepository
  ) {}

  async execute(input: UpsertCoursePriceInput): Promise<UpsertCoursePriceOutput> {
    // Verificar que o curso existe e pertence ao merchant
    const course = await this.courseRepository.findById(input.courseId);

    if (!course) {
      throw new Error(`Course ${input.courseId} not found`);
    }

    if (course.merchantId !== input.merchantId) {
      throw new Error("Unauthorized: course does not belong to this merchant");
    }

    // Validar valores
    if (input.amountCents <= 0) {
      throw new Error("Price must be greater than zero");
    }

    if (input.type === PriceType.SUBSCRIPTION && !input.recurrenceInterval) {
      throw new Error("Subscription price must have recurrenceInterval");
    }

    // Buscar preço ativo atual
    const activePrice = await this.coursePriceRepository.findActiveByCourseId(input.courseId);

    let price: CoursePriceRecord;

    if (activePrice) {
      // Atualizar preço existente
      price = await this.coursePriceRepository.update(activePrice.id, {
        type: input.type,
        amountCents: input.amountCents,
        currency: input.currency ?? "BRL",
        recurrenceInterval: input.recurrenceInterval,
      });

      logger.info(
        {
          useCase: "UpsertCoursePrice",
          entityId: price.id,
          courseId: input.courseId,
        },
        "Course price updated"
      );
    } else {
      // Criar novo preço
      price = await this.coursePriceRepository.create({
        courseId: input.courseId,
        type: input.type,
        amountCents: input.amountCents,
        currency: input.currency ?? "BRL",
        recurrenceInterval: input.recurrenceInterval,
        active: true,
      });

      logger.info(
        {
          useCase: "UpsertCoursePrice",
          entityId: price.id,
          courseId: input.courseId,
        },
        "Course price created"
      );
    }

    return { price };
  }
}

