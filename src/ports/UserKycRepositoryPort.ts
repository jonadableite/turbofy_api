export interface UserKycDocumentRecord {
  type: string;
  url: string;
}

export interface UserKycSubmissionRecord {
  id: string;
  userId: string;
  status: string;
  rejectionReason?: string | null;
  createdAt: Date;
  reviewedAt?: Date | null;
  reviewedByUserId?: string | null;
  documents?: UserKycDocumentRecord[];
}

export interface UserKycRepositoryPort {
  findById(submissionId: string): Promise<UserKycSubmissionRecord | null>;

  createSubmission(input: {
    userId: string;
    documents: UserKycDocumentRecord[];
  }): Promise<UserKycSubmissionRecord>;

  findLatestByUserId(userId: string): Promise<UserKycSubmissionRecord | null>;

  updateStatus(input: {
    submissionId: string;
    status: string;
    rejectionReason?: string | null;
    reviewedByUserId?: string | null;
    reviewedAt?: Date;
  }): Promise<UserKycSubmissionRecord>;
}

