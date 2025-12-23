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
      logger.warn({
        type: "PIX_WEBHOOK_CHARGE_NOT_FOUND",
        message: "Charge not found for webhook",
        payload: { chargeId: input.chargeId },
      });
      throw new Error(`Charge ${input.chargeId} not found`);
    }

    if (charge.status !== "PAID") {
      logger.warn({
        type: "PIX_WEBHOOK_INVALID_STATUS",
        message: "Charge is not in PAID status",
        payload: { chargeId: input.chargeId, status: charge.status },
      });
      return { enrollmentCreated: false };
    }

    // Verificar se já existe enrollment para esta charge (idempotência)
    const existingEnrollment = await this.enrollmentRepository.findByChargeId(input.chargeId);
    if (existingEnrollment) {
      logger.info({
        type: "PIX_WEBHOOK_ENROLLMENT_EXISTS",
        message: "Enrollment already exists for charge",
        payload: { chargeId: input.chargeId, enrollmentId: existingEnrollment.id },
      });
      return {
        enrollmentCreated: false,
        enrollmentId: existingEnrollment.id,
      };
    }

    // Verificar se externalRef indica um curso (formato: "course:<courseId>")
    const externalRef = charge.externalRef;
    if (!externalRef || !externalRef.startsWith("course:")) {
      logger.info({
        type: "PIX_WEBHOOK_NO_COURSE_REF",
        message: "Charge does not have course externalRef, skipping enrollment",
        payload: { chargeId: input.chargeId, externalRef },
      });
      return { enrollmentCreated: false };
    }

    const courseId = externalRef.replace("course:", "");
    const userId = charge.metadata?.userId as string | undefined;

    if (!userId) {
      logger.warn({
        type: "PIX_WEBHOOK_MISSING_USER",
        message: "Charge metadata does not contain userId",
        payload: { chargeId: input.chargeId },
      });
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

