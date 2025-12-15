import type { PrismaClient } from '@prisma/client';
import { MerchantDocumentRepository } from '../../ports/repositories/MerchantDocumentRepository';
import {
  MerchantDocument,
  DocumentType,
  DocumentStatus,
} from '../../domain/entities/MerchantDocument';

export class PrismaMerchantDocumentRepository
  implements MerchantDocumentRepository
{
  constructor(private prisma: PrismaClient) {}

  async save(document: MerchantDocument): Promise<void> {
    await this.prisma.merchantDocument.upsert({
      where: {
        merchantId_type: {
          merchantId: document.merchantId,
          type: document.type,
        },
      },
      create: {
        id: document.id,
        merchantId: document.merchantId,
        type: document.type,
        url: document.url,
        status: document.status,
        rejectionReason: document.rejectionReason,
        mimeType: document.props.mimeType,
        fileSize: document.props.fileSize,
        reviewedBy: document.props.reviewedBy,
        reviewedAt: document.props.reviewedAt,
        verificationNotes: document.props.verificationNotes,
        createdAt: document.props.createdAt,
        updatedAt: document.props.updatedAt,
      },
      update: {
        url: document.url,
        status: document.status,
        rejectionReason: document.rejectionReason,
        mimeType: document.props.mimeType,
        fileSize: document.props.fileSize,
        reviewedBy: document.props.reviewedBy,
        reviewedAt: document.props.reviewedAt,
        verificationNotes: document.props.verificationNotes,
        updatedAt: document.props.updatedAt,
      },
    });
  }

  async findById(id: string): Promise<MerchantDocument | null> {
    const data = await this.prisma.merchantDocument.findUnique({
      where: { id },
    });
    if (!data) return null;
    return this.toDomain(data);
  }

  async findByMerchantId(
    merchantId: string
  ): Promise<MerchantDocument[]> {
    const data = await this.prisma.merchantDocument.findMany({
      where: { merchantId },
    });
    return data.map((item) => this.toDomain(item));
  }

  async findByMerchantIdAndType(
    merchantId: string,
    type: string
  ): Promise<MerchantDocument | null> {
    const data = await this.prisma.merchantDocument.findUnique({
      where: {
        merchantId_type: {
          merchantId,
          type,
        },
      },
    });
    if (!data) return null;
    return this.toDomain(data);
  }

  private toDomain(data: any): MerchantDocument {
    return new MerchantDocument({
      id: data.id,
      merchantId: data.merchantId,
      type: data.type as DocumentType,
      url: data.url,
      status: data.status as DocumentStatus,
      rejectionReason: data.rejectionReason,
      mimeType: data.mimeType,
      fileSize: data.fileSize,
      reviewedBy: data.reviewedBy,
      reviewedAt: data.reviewedAt,
      verificationNotes: data.verificationNotes,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    });
  }
}
