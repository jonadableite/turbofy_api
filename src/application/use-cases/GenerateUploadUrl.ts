
import { randomUUID } from 'crypto';
import { StoragePort } from '../../ports/StoragePort';

export interface GenerateUploadUrlInput {
  merchantId: string;
  documentType: string; // 'RG_FRONT', 'RG_BACK', 'SELFIE'
  contentType: string; // 'image/jpeg', 'image/png', 'application/pdf'
}

export interface GenerateUploadUrlOutput {
  uploadUrl: string;
  key: string;
}

export class GenerateUploadUrl {
  constructor(private storagePort: StoragePort) {}

  async execute(input: GenerateUploadUrlInput): Promise<GenerateUploadUrlOutput> {
    const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];
    if (!allowedTypes.includes(input.contentType)) {
      throw new Error('Invalid content type. Allowed: JPG, PNG, PDF.');
    }

    const key = `documents/${input.merchantId}/${input.documentType}_${randomUUID()}`;
    const uploadUrl = await this.storagePort.generatePresignedUploadUrl(key, input.contentType);

    return {
      uploadUrl,
      key,
    };
  }
}

