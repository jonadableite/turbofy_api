import { LedgerEntryStatus, LedgerEntryType } from "../entities/LedgerEntryType";

export interface LedgerLike {
  type: string;
  status: string;
  amountCents: number;
  isCredit: boolean;
}

export interface CalculatedBalance {
  postedBalance: number;
  available: number;
}

export const calculateBalance = (entries: LedgerLike[]): CalculatedBalance => {
  let postedCredits = 0;
  let postedDebits = 0;
  let pendingWithdrawalDebits = 0;

  for (const entry of entries) {
    if (entry.status === LedgerEntryStatus.POSTED) {
      if (entry.isCredit) {
        postedCredits += entry.amountCents;
      } else {
        postedDebits += entry.amountCents;
      }
      continue;
    }

    if (entry.status === LedgerEntryStatus.PENDING) {
      if (
        entry.type === LedgerEntryType.WITHDRAWAL_DEBIT ||
        entry.type === LedgerEntryType.WITHDRAWAL_FEE
      ) {
        pendingWithdrawalDebits += entry.amountCents;
      }
    }
  }

  const postedBalance = postedCredits - postedDebits;
  const available = postedBalance - pendingWithdrawalDebits;

  return { postedBalance, available };
};

