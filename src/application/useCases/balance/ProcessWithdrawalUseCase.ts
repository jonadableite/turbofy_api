import { WithdrawalStatus } from "../../../domain/entities/WithdrawalStatus";
import { LedgerEntryStatus, LedgerEntryType } from "../../../domain/entities/LedgerEntryType";
import { UserLedgerRepositoryPort } from "../../../ports/UserLedgerRepositoryPort";
import { UserPixKeyRepositoryPort } from "../../../ports/UserPixKeyRepositoryPort";
import { WithdrawalRepositoryPort } from "../../../ports/WithdrawalRepositoryPort";
import { TransfeeraClient } from "../../../infrastructure/adapters/payment/TransfeeraClient";
import { prisma } from "../../../infrastructure/database/prismaClient";
import { logger } from "../../../infrastructure/logger";
import { onlyDigits } from "../../../utils/brDoc";

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

    if (!user.document) {
      throw new Error("User document not found");
    }

    const pixKey = await this.pixKeyRepository.findByUserId(withdrawal.userId);
    if (!pixKey) {
      throw new Error("Pix key not found");
    }

    const normalizedDocument = onlyDigits(user.document);

    try {
      logger.info(
        {
          withdrawalId: withdrawal.id,
          userId: withdrawal.userId,
          amountCents: withdrawal.amountCents,
          pixKey: pixKey.key,
        },
        "Processing withdrawal with Transfeera"
      );

    const batch = await this.transfeeraClient.createBatch({
      type: "TRANSFERENCIA",
      autoClose: true,
        name: `Saque Turbofy #${withdrawal.id.slice(0, 8)}`,
      });

      logger.info(
        {
          withdrawalId: withdrawal.id,
          batchId: batch.id,
        },
        "Batch created for withdrawal"
      );

    const transfer = await this.transfeeraClient.createTransfer(batch.id, {
      value: withdrawal.amountCents / 100,
      idempotency_key: withdrawal.idempotencyKey,
        pix_description: `Saque Turbofy #${withdrawal.id.slice(0, 8)}`,
      destination_bank_account: {
        pix_key_type: pixKey.type,
        pix_key: pixKey.key,
      },
        pix_key_validation: {
          cpf_cnpj: normalizedDocument, // Validação adicional na transferência
        },
      });

      logger.info(
        {
          withdrawalId: withdrawal.id,
          transferId: transfer.id,
          transferStatus: transfer.status,
        },
        "Transfer created"
      );

      const isSuccess =
        transfer.status?.toUpperCase() === "COMPLETED" ||
        transfer.status?.toUpperCase() === "FINALIZADO";
      const isFailure =
        transfer.status?.toUpperCase() === "FAILED" ||
        transfer.status?.toUpperCase() === "FALHA";

    if (isSuccess) {
      const updatedWithdrawal = await this.withdrawalRepository.update({
        ...withdrawal,
        status: WithdrawalStatus.COMPLETED,
        transferaTxId: transfer.id,
        processedAt: new Date(),
      });

        const pendingEntries = (
          await this.ledgerRepository.getEntriesForUser(withdrawal.userId)
        ).filter(
        (entry) =>
          entry.referenceId === withdrawal.id &&
          (entry.type === LedgerEntryType.WITHDRAWAL_DEBIT ||
            entry.type === LedgerEntryType.WITHDRAWAL_FEE)
      );

      await this.ledgerRepository.updateStatus({
        ids: pendingEntries.map((e) => e.id),
        status: LedgerEntryStatus.POSTED,
      });

        logger.info(
          {
            withdrawalId: withdrawal.id,
            transferId: transfer.id,
          },
          "Withdrawal completed successfully"
        );

      return updatedWithdrawal;
    }

    if (isFailure) {
      const updatedWithdrawal = await this.withdrawalRepository.update({
        ...withdrawal,
        status: WithdrawalStatus.FAILED,
        failureReason: transfer.error?.message ?? "Transfer failed",
        processedAt: new Date(),
      });

        const pendingEntries = (
          await this.ledgerRepository.getEntriesForUser(withdrawal.userId)
        ).filter(
        (entry) =>
          entry.referenceId === withdrawal.id &&
          (entry.type === LedgerEntryType.WITHDRAWAL_DEBIT ||
            entry.type === LedgerEntryType.WITHDRAWAL_FEE)
      );

      await this.ledgerRepository.updateStatus({
        ids: pendingEntries.map((e) => e.id),
        status: LedgerEntryStatus.CANCELED,
      });

        logger.warn(
          {
            withdrawalId: withdrawal.id,
            transferId: transfer.id,
            failureReason: transfer.error?.message,
          },
          "Withdrawal failed"
        );

      return updatedWithdrawal;
    }

    // Em processamento ou status desconhecido
      logger.info(
        {
          withdrawalId: withdrawal.id,
          transferStatus: transfer.status,
        },
        "Withdrawal still processing"
      );

    return withdrawal;
    } catch (error) {
      logger.error(
        {
          withdrawalId: withdrawal.id,
          error: error instanceof Error ? error.message : "Unknown error",
          stack: error instanceof Error ? error.stack : undefined,
        },
        "Error processing withdrawal"
      );

      throw error;
    }
  }
}

