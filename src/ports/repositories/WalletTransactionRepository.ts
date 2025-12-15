import { WalletTransaction, WalletTransactionType, WalletTransactionStatus } from "../../domain/entities/WalletTransaction";

export interface WalletTransactionRepository {
  create(transaction: WalletTransaction): Promise<WalletTransaction>;
  findByWalletId(walletId: string, filters?: {
    type?: WalletTransactionType;
    status?: WalletTransactionStatus;
    limit?: number;
    offset?: number;
  }): Promise<WalletTransaction[]>;
  findByReferenceId(referenceId: string): Promise<WalletTransaction | null>;
  update(transaction: WalletTransaction): Promise<WalletTransaction>;
}

