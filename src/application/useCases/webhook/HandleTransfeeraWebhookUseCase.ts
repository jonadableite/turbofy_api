import { WithdrawalRepositoryPort, WithdrawalRecord } from "../../../ports/WithdrawalRepositoryPort";
import { UserLedgerRepositoryPort } from "../../../ports/UserLedgerRepositoryPort";
import { WithdrawalStatus } from "../../../domain/entities/WithdrawalStatus";
import { LedgerEntryStatus, LedgerEntryType } from "../../../domain/entities/LedgerEntryType";
import { logger } from "../../../infrastructure/logger";

interface HandleTransfeeraWebhookInput {
  transferId: string;
  status: string;
  eventType: string;
  metadata?: Record<string, unknown>;
}

export class HandleTransfeeraWebhookUseCase {
  constructor(
    private readonly withdrawalRepository: WithdrawalRepositoryPort,
    private readonly ledgerRepository: UserLedgerRepositoryPort
  ) {}

  async execute(input: HandleTransfeeraWebhookInput): Promise<void> {
    logger.info(
      {
        transferId: input.transferId,
        status: input.status,
        eventType: input.eventType,
      },
      "Processing Transfeera webhook"
    );

    // Buscar withdrawal pelo transferaTxId
    const withdrawal = await this.withdrawalRepository.findByTransferaTxId(input.transferId);

    if (!withdrawal) {
      logger.warn(
        { transferId: input.transferId },
        "Withdrawal not found for transfer ID"
      );
      return;
    }

    // Se já está em status final, ignorar
    if (
      withdrawal.status === WithdrawalStatus.COMPLETED ||
      withdrawal.status === WithdrawalStatus.CANCELED
    ) {
      logger.info(
        {
          withdrawalId: withdrawal.id,
          currentStatus: withdrawal.status,
          webhookStatus: input.status,
        },
        "Withdrawal already in final status, ignoring webhook"
      );
      return;
    }

    const transferStatus = input.status.toUpperCase();

    // Status FINALIZADO = sucesso
    if (transferStatus === "FINALIZADO") {
      await this.handleSuccess(withdrawal);
      return;
    }

    // Status DEVOLVIDO = falha/estorno
    if (transferStatus === "DEVOLVIDO") {
      await this.handleFailure(withdrawal, "Transferência devolvida pelo banco");
      return;
    }

    // Status FALHA (deprecated, mas ainda pode chegar)
    if (transferStatus === "FALHA") {
      await this.handleFailure(withdrawal, "Transferência falhou");
      return;
    }

    // Status intermediário (CRIADA, RECEBIDO, TRANSFERIDO)
    if (
      transferStatus === "CRIADA" ||
      transferStatus === "RECEBIDO" ||
      transferStatus === "TRANSFERIDO"
    ) {
      await this.handleProcessing(withdrawal);
      return;
    }

    logger.warn(
      {
        withdrawalId: withdrawal.id,
        transferId: input.transferId,
        status: input.status,
      },
      "Unknown transfer status received from webhook"
    );
  }

  private async handleSuccess(withdrawal: WithdrawalRecord): Promise<void> {
    logger.info(
      { withdrawalId: withdrawal.id },
      "Marking withdrawal as completed via webhook"
    );

    await this.withdrawalRepository.update({
      ...withdrawal,
      status: WithdrawalStatus.COMPLETED,
      processedAt: new Date(),
    });

    // Atualizar entries do ledger para POSTED
    const pendingEntries = (
      await this.ledgerRepository.getEntriesForUser(withdrawal.userId)
    ).filter(
      (entry) =>
        entry.referenceId === withdrawal.id &&
        entry.status === LedgerEntryStatus.PENDING &&
        (entry.type === LedgerEntryType.WITHDRAWAL_DEBIT ||
          entry.type === LedgerEntryType.WITHDRAWAL_FEE)
    );

    if (pendingEntries.length > 0) {
      await this.ledgerRepository.updateStatus({
        ids: pendingEntries.map((e) => e.id),
        status: LedgerEntryStatus.POSTED,
      });
    }

    logger.info(
      { withdrawalId: withdrawal.id, entriesUpdated: pendingEntries.length },
      "Withdrawal completed successfully via webhook"
    );
  }

  private async handleFailure(
    withdrawal: WithdrawalRecord,
    reason: string
  ): Promise<void> {
    logger.warn(
      { withdrawalId: withdrawal.id, reason },
      "Marking withdrawal as failed via webhook"
    );

    await this.withdrawalRepository.update({
      ...withdrawal,
      status: WithdrawalStatus.FAILED,
      failureReason: reason,
      processedAt: new Date(),
    });

    // Cancelar entries do ledger (devolver saldo)
    const pendingEntries = (
      await this.ledgerRepository.getEntriesForUser(withdrawal.userId)
    ).filter(
      (entry) =>
        entry.referenceId === withdrawal.id &&
        entry.status === LedgerEntryStatus.PENDING &&
        (entry.type === LedgerEntryType.WITHDRAWAL_DEBIT ||
          entry.type === LedgerEntryType.WITHDRAWAL_FEE)
    );

    if (pendingEntries.length > 0) {
      await this.ledgerRepository.updateStatus({
        ids: pendingEntries.map((e) => e.id),
        status: LedgerEntryStatus.CANCELED,
      });
    }

    logger.info(
      { withdrawalId: withdrawal.id, entriesReverted: pendingEntries.length },
      "Withdrawal failed, ledger entries reverted"
    );
  }

  private async handleProcessing(withdrawal: WithdrawalRecord): Promise<void> {
    // Se ainda está em REQUESTED, mudar para PROCESSING
    if (withdrawal.status === WithdrawalStatus.REQUESTED) {
      logger.info(
        { withdrawalId: withdrawal.id },
        "Moving withdrawal to PROCESSING status"
      );

      await this.withdrawalRepository.update({
        ...withdrawal,
        status: WithdrawalStatus.PROCESSING,
      });
    }
  }
}

