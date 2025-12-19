import { calculateBalance } from "../../../domain/services/BalanceCalculator";
import { UserLedgerRepositoryPort } from "../../../ports/UserLedgerRepositoryPort";

interface GetBalanceInput {
  userId: string;
}

export class GetBalanceUseCase {
  constructor(private readonly ledgerRepository: UserLedgerRepositoryPort) {}

  async execute(input: GetBalanceInput) {
    const entries = await this.ledgerRepository.getEntriesForUser(input.userId);
    return calculateBalance(entries);
  }
}

