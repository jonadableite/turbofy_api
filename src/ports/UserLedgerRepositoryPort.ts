export interface UserLedgerEntryRecord {
  id: string;
  userId: string;
  type: string;
  status: string;
  amountCents: number;
  isCredit: boolean;
  referenceType: string;
  referenceId: string;
  occurredAt: Date;
  createdAt: Date;
}

export interface UserLedgerRepositoryPort {
  getEntriesForUser(userId: string): Promise<UserLedgerEntryRecord[]>;

  createMany(entries: Array<Omit<UserLedgerEntryRecord, "id" | "createdAt">>): Promise<UserLedgerEntryRecord[]>;

  updateStatus(params: {
    ids: string[];
    status: string;
  }): Promise<void>;
}

