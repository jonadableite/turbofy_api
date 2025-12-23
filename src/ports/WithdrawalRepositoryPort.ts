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

export interface WithdrawalListParams {
  userId: string;
  page?: number;
  limit?: number;
  status?: string;
}

export interface WithdrawalListResult {
  withdrawals: WithdrawalRecord[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface WithdrawalRepositoryPort {
  findById(id: string): Promise<WithdrawalRecord | null>;

  findByIdempotencyKey(userId: string, idempotencyKey: string): Promise<WithdrawalRecord | null>;

  findByTransferaTxId(transferaTxId: string): Promise<WithdrawalRecord | null>;

  findByUserId(params: WithdrawalListParams): Promise<WithdrawalListResult>;

  create(input: Omit<WithdrawalRecord, "createdAt" | "processedAt" | "transferaTxId" | "failureReason">): Promise<WithdrawalRecord>;

  update(withdrawal: WithdrawalRecord): Promise<WithdrawalRecord>;
}

