export interface WithdrawalRecord {
  id: string;
  userId: string;
  amountCents: number;
  feeCents: number;
  totalDebitedCents: number;
  status: string;
  transferaTxId?: string | null;
  failureReason?: string | null;
  idempotencyKey: string;
  createdAt: Date;
  processedAt?: Date | null;
  version: number;
}

export interface WithdrawalRepositoryPort {
  findById(id: string): Promise<WithdrawalRecord | null>;

  findByIdempotencyKey(userId: string, idempotencyKey: string): Promise<WithdrawalRecord | null>;

  create(input: Omit<WithdrawalRecord, "createdAt" | "processedAt" | "transferaTxId" | "failureReason">): Promise<WithdrawalRecord>;

  update(withdrawal: WithdrawalRecord): Promise<WithdrawalRecord>;
}

