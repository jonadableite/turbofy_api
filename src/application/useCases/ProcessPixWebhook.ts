/**
 * ProcessPixWebhook Use Case
 * 
 * Processa webhook de pagamento PIX e cria Enrollment automaticamente
 * 
 * @security Valida idempotência por chargeId
 * @performance Processamento assíncrono via RabbitMQ
 */

import { ChargeRepository } from "../../ports/ChargeRepository";
import { EnrollmentRepository } from "../../ports/repositories/EnrollmentRepository";
import { PaymentInteractionRepository } from "../../ports/repositories/PaymentInteractionRepository";
import { MessagingPort } from "../../ports/MessagingPort";
import { logger } from "../../infrastructure/logger";
import { PaymentInteraction, PaymentInteractionType } from "../../domain/entities/PaymentInteraction";
import { Enrollment } from "../../domain/entities/Enrollment";
import { randomUUID } from "crypto";

interface ProcessPixWebhookInput {
  chargeId: string;
  traceId?: string;
}

interface ProcessPixWebhookOutput {
  enrollmentCreated: boolean;
  enrollmentId?: string;
}

export class ProcessPixWebhook {
  constructor(
    private readonly chargeRepository: ChargeRepository,
    private readonly enrollmentRepository: EnrollmentRepository,
    private readonly paymentInteractionRepository: PaymentInteractionRepository,
    private readonly messaging: MessagingPort
  ) {}

  async execute(input: ProcessPixWebhookInput): Promise<ProcessPixWebhookOutput> {
    const charge = await this.chargeRepository.findById(input.chargeId);

    if (!charge) {
      logger.warn({ chargeId: input.chargeId }, "Charge not found for webhook");
      throw new Error(`Charge ${input.chargeId} not found`);
    }

    if (charge.status !== "PAID") {
      logger.warn(
        {
          chargeId: input.chargeId,
          status: charge.status,
        },
        "Charge is not in PAID status"
      );
      return { enrollmentCreated: false };
    }

    // Verificar se já existe enrollment para esta charge (idempotência)
    const existingEnrollment = await this.enrollmentRepository.findByChargeId(input.chargeId);
    if (existingEnrollment) {
      logger.info(
        {
          chargeId: input.chargeId,
          enrollmentId: existingEnrollment.id,
        },
        "Enrollment already exists for charge"
      );
      return {
        enrollmentCreated: false,
        enrollmentId: existingEnrollment.id,
      };
    }

    // Verificar se externalRef indica um curso (formato: "course:<courseId>")
    const externalRef = charge.externalRef;
    if (!externalRef || !externalRef.startsWith("course:")) {
      logger.info(
        {
          chargeId: input.chargeId,
          externalRef,
        },
        "Charge does not have course externalRef, skipping enrollment"
      );
      return { enrollmentCreated: false };
    }

    const courseId = externalRef.replace("course:", "");
    const userId = charge.metadata?.userId as string | undefined;

    if (!userId) {
      logger.warn(
        {
          chargeId: input.chargeId,
        },
        "Charge metadata does not contain userId"
      );
      return { enrollmentCreated: false };
    }

    // Criar enrollment
    const enrollment = Enrollment.create({
      courseId,
      userId,
      chargeId: input.chargeId,
    });
    await this.enrollmentRepository.create(enrollment);

    // Registrar PaymentInteraction
    const interaction = new PaymentInteraction({
      id: randomUUID(),
      merchantId: charge.merchantId,
      userId,
      chargeId: input.chargeId,
      type: PaymentInteractionType.ENROLLMENT_CREATED,
      method: charge.method,
      amountCents: charge.amountCents,
      metadata: {
        courseId,
        enrollmentId: enrollment.id,
      },
      createdAt: new Date(),
    });

    await this.paymentInteractionRepository.create(interaction);

    // Publicar evento enrollment.granted
    await this.messaging.publish({
      id: randomUUID(),
      type: "enrollment.granted",
      timestamp: new Date().toISOString(),
      version: "v1",
      traceId: input.traceId,
      idempotencyKey: `enrollment-${enrollment.id}`,
      routingKey: "enrollment.granted",
      payload: {
        enrollmentId: enrollment.id,
        courseId,
        userId,
        chargeId: input.chargeId,
      },
    });

    logger.info(
      {
        enrollmentId: enrollment.id,
        courseId,
        userId,
        chargeId: input.chargeId,
      },
      "Enrollment created from PIX webhook"
    );

    return {
      enrollmentCreated: true,
      enrollmentId: enrollment.id,
    };
  }
}

