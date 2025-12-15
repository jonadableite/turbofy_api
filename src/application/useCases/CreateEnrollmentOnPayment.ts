import { EnrollmentRepository } from "../../ports/repositories/EnrollmentRepository";
import { CourseRepository } from "../../ports/repositories/CourseRepository";
import { Enrollment } from "../../domain/entities/Enrollment";
import { ChargeRepository } from "../../ports/ChargeRepository";
import { PaymentInteractionRepository } from "../../ports/repositories/PaymentInteractionRepository";
import { PaymentInteraction, PaymentInteractionType } from "../../domain/entities/PaymentInteraction";
import { EmailService } from "../../infrastructure/email/EmailService";
import { logger } from "../../infrastructure/logger";
import { env } from "../../config/env";

interface CreateEnrollmentOnPaymentInput {
  chargeId: string;
  userId: string;
  idempotencyKey?: string;
}

interface CreateEnrollmentOnPaymentOutput {
  enrollment: Enrollment;
}

export class CreateEnrollmentOnPayment {
  constructor(
    private readonly enrollmentRepository: EnrollmentRepository,
    private readonly courseRepository: CourseRepository,
    private readonly chargeRepository: ChargeRepository,
    private readonly paymentInteractionRepository: PaymentInteractionRepository,
    private readonly emailService: EmailService
  ) {}

  async execute(input: CreateEnrollmentOnPaymentInput): Promise<CreateEnrollmentOnPaymentOutput> {
    // 1. Verificar idempotência: se já existe matrícula para este chargeId, retornar
    const existingEnrollment = await this.enrollmentRepository.findByChargeId(input.chargeId);
    if (existingEnrollment) {
      logger.info(
        {
          useCase: "CreateEnrollmentOnPayment",
          chargeId: input.chargeId,
          enrollmentId: existingEnrollment.id,
        },
        "Enrollment already exists for this charge (idempotent)"
      );
      return { enrollment: existingEnrollment };
    }

    // 2. Buscar a cobrança
    const charge = await this.chargeRepository.findById(input.chargeId);
    if (!charge) {
      throw new Error(`Charge ${input.chargeId} not found`);
    }

    // 3. Extrair courseId do externalRef (formato: "course:<courseId>")
    const externalRef = charge.externalRef;
    if (!externalRef || !externalRef.startsWith("course:")) {
      logger.warn(
        {
          useCase: "CreateEnrollmentOnPayment",
          chargeId: input.chargeId,
          externalRef,
        },
        "Charge does not have valid course externalRef - skipping enrollment"
      );
      throw new Error("Charge is not associated with a course");
    }

    const courseId = externalRef.replace("course:", "");

    // 4. Validar que o curso existe
    const course = await this.courseRepository.findById(courseId);
    if (!course) {
      throw new Error(`Course ${courseId} not found`);
    }

    // 5. Criar matrícula
    const enrollment = Enrollment.create({
      courseId,
      userId: input.userId,
      chargeId: input.chargeId,
    });

    const savedEnrollment = await this.enrollmentRepository.create(enrollment);

    // 6. Registrar interação
    await this.paymentInteractionRepository.create(
      PaymentInteraction.create({
        merchantId: charge.merchantId,
        userId: input.userId,
        chargeId: input.chargeId,
        type: PaymentInteractionType.ENROLLMENT_CREATED,
        amountCents: charge.amountCents,
        metadata: {
          courseId,
          enrollmentId: savedEnrollment.id,
        },
      })
    );

    // 7. Enviar e-mail de boas-vindas com acesso
    try {
      const membersUrl = `${env.FRONTEND_URL}/members/courses/${courseId}`;
      await this.emailService.sendGenericEmail(
        input.userId, // Assumindo que userId é o email ou precisa buscar User
        "Seu acesso foi liberado! 🎉",
        `
          <h1>Parabéns! Seu pagamento foi confirmado.</h1>
          <p>Você agora tem acesso ao curso <strong>${course.title}</strong>.</p>
          <p><a href="${membersUrl}">Clique aqui para acessar o curso</a></p>
        `
      );
    } catch (emailError) {
      logger.error(
        {
          useCase: "CreateEnrollmentOnPayment",
          enrollmentId: savedEnrollment.id,
          error: emailError,
        },
        "Failed to send enrollment email"
      );
      // Não falhar o caso de uso por erro de email
    }

    logger.info(
      {
        useCase: "CreateEnrollmentOnPayment",
        entityId: savedEnrollment.id,
        courseId,
        userId: input.userId,
        chargeId: input.chargeId,
      },
      "Enrollment created successfully"
    );

    return { enrollment: savedEnrollment };
  }
}

