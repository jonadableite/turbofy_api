import { calculateBalance } from "../BalanceCalculator";
import { LedgerEntryStatus, LedgerEntryType } from "../../entities/LedgerEntryType";

describe("calculateBalance", () => {
  it("should compute posted and available balances with pending withdrawals", () => {
    const entries = [
      { type: LedgerEntryType.CHARGE_NET, status: LedgerEntryStatus.POSTED, amountCents: 10000, isCredit: true },
      { type: LedgerEntryType.WITHDRAWAL_DEBIT, status: LedgerEntryStatus.PENDING, amountCents: 3000, isCredit: false },
      { type: LedgerEntryType.WITHDRAWAL_FEE, status: LedgerEntryStatus.PENDING, amountCents: 150, isCredit: false },
    ];

    const result = calculateBalance(entries);
    expect(result.postedBalance).toBe(10000);
    expect(result.available).toBe(10000 - 3000 - 150);
  });
});

