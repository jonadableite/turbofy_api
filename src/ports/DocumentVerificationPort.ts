import { DocumentType } from "../domain/entities/MerchantDocument";

export interface DocumentVerificationInput {
  documentId: string;
  merchantId: string;
  documentType: DocumentType;
  fileKey: string;
  mimeType?: string | null;
  fileSize?: number | null;
}

export type DocumentVerificationStatus = "PASSED" | "FAILED" | "MANUAL_REVIEW";

export interface DocumentVerificationResult {
  status: DocumentVerificationStatus;
  reason?: string;
  score?: number;
  details?: string;
}

export interface DocumentVerificationPort {
  validateDocument(input: DocumentVerificationInput): Promise<DocumentVerificationResult>;
}


