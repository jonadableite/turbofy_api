import { WithdrawalStatus } from "../../../domain/entities/WithdrawalStatus";
import { LedgerEntryStatus, LedgerEntryType } from "../../../domain/entities/LedgerEntryType";
import { UserLedgerRepositoryPort } from "../../../ports/UserLedgerRepositoryPort";
import { UserPixKeyRepositoryPort } from "../../../ports/UserPixKeyRepositoryPort";
import { WithdrawalRepositoryPort } from "../../../ports/WithdrawalRepositoryPort";
import { TransfeeraClient } from "../../../infrastructure/adapters/payment/TransfeeraClient";
import { prisma } from "../../../infrastructure/database/prismaClient";

interface ProcessWithdrawalInput {
  withdrawalId: string;
}

export class ProcessWithdrawalUseCase {
  constructor(
    private readonly ledgerRepository: UserLedgerRepositoryPort,
    private readonly pixKeyRepository: UserPixKeyRepositoryPort,
    private readonly withdrawalRepository: WithdrawalRepositoryPort,
    private readonly transfeeraClient: TransfeeraClient = new TransfeeraClient()
  ) {}

  async execute(input: ProcessWithdrawalInput) {
    const withdrawal = await this.withdrawalRepository.findById(input.withdrawalId);
    if (!withdrawal) {
      throw new Error("Withdrawal not found");
    }

    if (
      withdrawal.status === WithdrawalStatus.COMPLETED ||
      withdrawal.status === WithdrawalStatus.CANCELED ||
      withdrawal.status === WithdrawalStatus.FAILED
    ) {
      return withdrawal;
    }

    const user = await prisma.user.findUnique({ where: { id: withdrawal.userId } });
    if (!user) {
      throw new Error("User not found");
    }

    const pixKey = await this.pixKeyRepository.findByUserId(withdrawal.userId);
    if (!pixKey) {
      throw new Error("Pix key not found");
    }

    const batch = await this.transfeeraClient.createBatch({
      type: "TRANSFERENCIA",
      autoClose: true,
      name: `withdrawal-${withdrawal.id}`,
    });

    const transfer = await this.transfeeraClient.createTransfer(batch.id, {
      value: withdrawal.amountCents / 100,
      idempotency_key: withdrawal.idempotencyKey,
      pix_description: `withdrawal-${withdrawal.id}`,
      destination_bank_account: {
        pix_key_type: pixKey.type,
        pix_key: pixKey.key,
      },
    });

    const isSuccess = transfer.status?.toUpperCase() === "COMPLETED" || transfer.status?.toUpperCase() === "FINALIZADO";
    const isFailure = transfer.status?.toUpperCase() === "FAILED" || transfer.status?.toUpperCase() === "FALHA";

    if (isSuccess) {
      const updatedWithdrawal = await this.withdrawalRepository.update({
        ...withdrawal,
        status: WithdrawalStatus.COMPLETED,
        transferaTxId: transfer.id,
        processedAt: new Date(),
      });

      const pendingEntries = (await this.ledgerRepository.getEntriesForUser(withdrawal.userId)).filter(
        (entry) =>
          entry.referenceId === withdrawal.id &&
          (entry.type === LedgerEntryType.WITHDRAWAL_DEBIT ||
            entry.type === LedgerEntryType.WITHDRAWAL_FEE)
      );

      await this.ledgerRepository.updateStatus({
        ids: pendingEntries.map((e) => e.id),
        status: LedgerEntryStatus.POSTED,
      });

      return updatedWithdrawal;
    }

    if (isFailure) {
      const updatedWithdrawal = await this.withdrawalRepository.update({
        ...withdrawal,
        status: WithdrawalStatus.FAILED,
        failureReason: transfer.error?.message ?? "Transfer failed",
        processedAt: new Date(),
      });

      const pendingEntries = (await this.ledgerRepository.getEntriesForUser(withdrawal.userId)).filter(
        (entry) =>
          entry.referenceId === withdrawal.id &&
          (entry.type === LedgerEntryType.WITHDRAWAL_DEBIT ||
            entry.type === LedgerEntryType.WITHDRAWAL_FEE)
      );

      await this.ledgerRepository.updateStatus({
        ids: pendingEntries.map((e) => e.id),
        status: LedgerEntryStatus.CANCELED,
      });

      return updatedWithdrawal;
    }

    // Em processamento ou status desconhecido
    return withdrawal;
  }
}

