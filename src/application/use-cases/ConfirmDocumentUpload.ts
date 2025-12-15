
import { randomUUID } from 'crypto';
import { MerchantDocument, DocumentType } from '../../domain/entities/MerchantDocument';
import { MerchantDocumentRepository } from '../../ports/repositories/MerchantDocumentRepository';
import { StoragePort } from '../../ports/StoragePort';
import { MessagingPort } from '../../ports/MessagingPort';

export interface ConfirmDocumentUploadInput {
  merchantId: string;
  documentType: string;
  key: string;
}

export class ConfirmDocumentUpload {
  constructor(
    private merchantDocumentRepository: MerchantDocumentRepository,
    private storagePort: StoragePort,
    private messagingPort: MessagingPort
  ) {}

  async execute(input: ConfirmDocumentUploadInput): Promise<void> {
    const metadata = await this.storagePort.getFileMetadata(input.key);
    if (!metadata) {
      throw new Error('File not found in storage.');
    }

    // Validate size (e.g. max 5MB)
    if (metadata.size > 5 * 1024 * 1024) {
      await this.storagePort.deleteFile(input.key);
      throw new Error('File too large. Max 5MB.');
    }

    const existingDocument = await this.merchantDocumentRepository.findByMerchantIdAndType(
      input.merchantId,
      input.documentType,
    );

    const documentId = existingDocument?.id ?? randomUUID();

    const entity = new MerchantDocument({
      id: documentId,
      merchantId: input.merchantId,
      type: input.documentType as DocumentType,
      url: input.key,
      status: 'PENDING_ANALYSIS',
      createdAt: existingDocument?.props.createdAt,
    });

    entity.confirmUpload({
      mimeType: metadata.mimeType || 'application/octet-stream',
      fileSize: metadata.size,
    });

    await this.merchantDocumentRepository.save(entity);

    await this.messagingPort.publish({
      id: randomUUID(),
      type: 'document.uploaded',
      timestamp: new Date().toISOString(),
      version: 'v1',
      routingKey: 'document.uploaded',
      payload: {
        documentId,
        merchantId: input.merchantId,
        documentType: input.documentType,
        fileKey: input.key,
        mimeType: metadata.mimeType,
        fileSize: metadata.size,
      },
    });
  }
}

