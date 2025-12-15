
export interface MerchantDocumentProps {
  id?: string;
  merchantId: string;
  type: DocumentType;
  url: string;
  status: DocumentStatus;
  rejectionReason?: string | null;
  mimeType?: string | null;
  fileSize?: number | null;
  reviewedBy?: string | null;
  reviewedAt?: Date | null;
  verificationNotes?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export type DocumentType = 'RG_FRONT' | 'RG_BACK' | 'SELFIE' | 'CNH_OPENED';
export type DocumentStatus = 'PENDING_UPLOAD' | 'PENDING_ANALYSIS' | 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED';

export class MerchantDocument {
  public readonly props: MerchantDocumentProps;

  constructor(props: MerchantDocumentProps) {
    this.props = {
      ...props,
      createdAt: props.createdAt || new Date(),
      updatedAt: props.updatedAt || new Date(),
    };
  }

  get id() { return this.props.id; }
  get merchantId() { return this.props.merchantId; }
  get type() { return this.props.type; }
  get url() { return this.props.url; }
  get status() { return this.props.status; }
  get rejectionReason() { return this.props.rejectionReason; }

  approve(reviewerId: string) {
    this.props.status = 'APPROVED';
    this.props.reviewedBy = reviewerId;
    this.props.reviewedAt = new Date();
    this.props.rejectionReason = null;
    this.props.updatedAt = new Date();
  }

  reject(reviewerId: string, reason: string) {
    this.props.status = 'REJECTED';
    this.props.reviewedBy = reviewerId;
    this.props.reviewedAt = new Date();
    this.props.rejectionReason = reason;
    this.props.updatedAt = new Date();
  }

  requestChanges(reviewerId: string, reason: string) {
    this.props.status = 'CHANGES_REQUESTED';
    this.props.reviewedBy = reviewerId;
    this.props.reviewedAt = new Date();
    this.props.rejectionReason = reason;
    this.props.updatedAt = new Date();
  }

  confirmUpload(metadata: { mimeType: string; fileSize: number }) {
    this.props.status = 'PENDING_ANALYSIS';
    this.props.mimeType = metadata.mimeType;
    this.props.fileSize = metadata.fileSize;
    this.props.updatedAt = new Date();
  }

  setVerificationNotes(notes: string) {
    this.props.verificationNotes = notes;
    this.props.updatedAt = new Date();
  }
}

