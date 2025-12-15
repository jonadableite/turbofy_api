import { RabbitMQConsumer, EventHandler, QueueBinding } from "../adapters/messaging/RabbitMQConsumer";
import { AutoValidateDocument } from "../../application/use-cases/AutoValidateDocument";
import { PrismaMerchantDocumentRepository } from "../repositories/PrismaMerchantDocumentRepository";
import { SimpleDocumentVerificationAdapter } from "../external/SimpleDocumentVerificationAdapter";
import { EmailService } from "../email/EmailService";
import { prisma } from "../database/prismaClient";
import { logger } from "../logger";

class DocumentValidationHandler implements EventHandler {
  constructor(private readonly useCase: AutoValidateDocument) {}

  async handle(event: {
    payload: {
      documentId: string;
      merchantId: string;
      documentType: string;
      fileKey: string;
      mimeType?: string;
      fileSize?: number;
    };
  }): Promise<void> {
    await this.useCase.execute({
      documentId: event.payload.documentId,
      merchantId: event.payload.merchantId,
      documentType: event.payload.documentType,
      fileKey: event.payload.fileKey,
      mimeType: event.payload.mimeType,
      fileSize: event.payload.fileSize,
    });
  }
}

export async function startDocumentValidationConsumer(): Promise<RabbitMQConsumer> {
  const bindings: QueueBinding[] = [
    { eventType: "document.uploaded", queueName: "turbofy.onboarding.document.uploaded" },
  ];

  const consumer = new RabbitMQConsumer(bindings);

  const documentRepository = new PrismaMerchantDocumentRepository(prisma);
  const verificationAdapter = new SimpleDocumentVerificationAdapter();
  const emailService = new EmailService();
  const useCase = new AutoValidateDocument(documentRepository, verificationAdapter, emailService);
  const handler = new DocumentValidationHandler(useCase);

  consumer.registerHandler("document.uploaded", handler);
  await consumer.start();

  logger.info("DocumentValidationConsumer started");

  return consumer;
}


