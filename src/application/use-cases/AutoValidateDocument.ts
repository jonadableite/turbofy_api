import { MerchantDocumentRepository } from "../../ports/repositories/MerchantDocumentRepository";
import { DocumentVerificationPort } from "../../ports/DocumentVerificationPort";
import { EmailService } from "../../infrastructure/email/EmailService";
import { logger } from "../../infrastructure/logger";
import { prisma } from "../../infrastructure/database/prismaClient";
import { MerchantDocument } from "../../domain/entities/MerchantDocument";

export interface AutoValidateDocumentInput {
  documentId: string;
  merchantId: string;
  documentType: string;
  fileKey: string;
  mimeType?: string | null;
  fileSize?: number | null;
}

const AUTO_VALIDATION_REVIEWER = "AUTO_VALIDATION";

export class AutoValidateDocument {
  constructor(
    private readonly merchantDocumentRepository: MerchantDocumentRepository,
    private readonly documentVerificationPort: DocumentVerificationPort,
    private readonly emailService: EmailService
  ) {}

  async execute(input: AutoValidateDocumentInput): Promise<void> {
    const document = await this.merchantDocumentRepository.findById(input.documentId);
    if (!document) {
      logger.warn({ documentId: input.documentId }, "Document not found during auto validation");
      return;
    }

    const verification = await this.documentVerificationPort.validateDocument({
      documentId: input.documentId,
      documentType: document.type,
      merchantId: input.merchantId,
      fileKey: input.fileKey,
      mimeType: input.mimeType ?? document.props.mimeType,
      fileSize: input.fileSize ?? document.props.fileSize,
    });

    if (verification.status === "FAILED") {
      document.requestChanges(AUTO_VALIDATION_REVIEWER, verification.reason || "Falha na verificação automática");
      document.setVerificationNotes(verification.reason || "Falha na validação automática");
      await this.persist(document);
      await this.notifyMerchant(document, "CHANGES_REQUESTED", verification.reason);
      logger.info(
        {
          documentId: document.id,
          merchantId: document.merchantId,
        },
        "Document failed auto validation"
      );
      return;
    }

    if (verification.status === "MANUAL_REVIEW") {
      document.setVerificationNotes(verification.reason || "Encaminhado para revisão manual");
      await this.persist(document);
      logger.info(
        {
          documentId: document.id,
          merchantId: document.merchantId,
        },
        "Document queued for manual review after auto validation"
      );
      return;
    }

    document.setVerificationNotes(verification.reason || "Pré-validação automática concluída com sucesso");
    await this.persist(document);
    await this.notifyMerchant(document, "PENDING_ANALYSIS");
    logger.info(
      {
        documentId: document.id,
        merchantId: document.merchantId,
      },
      "Document auto validation passed"
    );
  }

  private async notifyMerchant(document: MerchantDocument, status: string, reason?: string): Promise<void> {
    const merchant = await prisma.merchant.findUnique({
      where: { id: document.merchantId },
      select: { email: true, name: true },
    });

    if (!merchant?.email) {
      logger.warn({ merchantId: document.merchantId }, "Merchant email not found, skipping notification");
      return;
    }

    await this.emailService.sendDocumentStatusEmail(merchant.email, {
      merchantName: merchant.name ?? "Produtor",
      documentType: document.type,
      status,
      reason,
    });
  }

  private async persist(document: MerchantDocument): Promise<void> {
    await this.merchantDocumentRepository.save(document);
  }
}


