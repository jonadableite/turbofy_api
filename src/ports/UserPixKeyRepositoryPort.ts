export interface UserPixKeyRecord {
  id: string;
  userId: string;
  type: string;
  key: string;
  status: string;
  verificationSource?: string | null;
  createdAt: Date;
  verifiedAt?: Date | null;
  rejectedAt?: Date | null;
  rejectionReason?: string | null;
}

export interface UserPixKeyRepositoryPort {
  findByUserId(userId: string): Promise<UserPixKeyRecord | null>;

  create(key: {
    userId: string;
    type: string;
    key: string;
    status: string;
    verificationSource?: string | null;
  }): Promise<UserPixKeyRecord>;

  update(key: UserPixKeyRecord): Promise<UserPixKeyRecord>;
}

