import { describe, it, expect, beforeEach, vi } from "vitest";
import { HandleTransfeeraWebhookUseCase } from "../../../../application/useCases/webhook/HandleTransfeeraWebhookUseCase";
import { WithdrawalRepositoryPort } from "../../../../ports/WithdrawalRepositoryPort";
import { UserLedgerRepositoryPort } from "../../../../ports/UserLedgerRepositoryPort";
import { WithdrawalStatus } from "../../../../domain/entities/WithdrawalStatus";
import { LedgerEntryStatus, LedgerEntryType } from "../../../../domain/entities/LedgerEntryType";

// Mock do logger
vi.mock("../../../../infrastructure/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe("HandleTransfeeraWebhookUseCase", () => {
  let mockWithdrawalRepository: WithdrawalRepositoryPort;
  let mockLedgerRepository: UserLedgerRepositoryPort;
  let useCase: HandleTransfeeraWebhookUseCase;

  const mockWithdrawal = {
    id: "withdrawal-123",
    userId: "user-123",
    amountCents: 10000,
    feeCents: 150,
    totalDebitedCents: 10150,
    status: WithdrawalStatus.PROCESSING,
    transferaTxId: "transfer-123",
    failureReason: null,
    idempotencyKey: "idempotency-123",
    createdAt: new Date(),
    processedAt: null,
    version: 0,
  };

  const mockLedgerEntries = [
    {
      id: "entry-1",
      userId: "user-123",
      type: LedgerEntryType.WITHDRAWAL_DEBIT,
      amountCents: -10000,
      referenceId: "withdrawal-123",
      status: LedgerEntryStatus.PENDING,
      createdAt: new Date(),
    },
    {
      id: "entry-2",
      userId: "user-123",
      type: LedgerEntryType.WITHDRAWAL_FEE,
      amountCents: -150,
      referenceId: "withdrawal-123",
      status: LedgerEntryStatus.PENDING,
      createdAt: new Date(),
    },
  ];

  beforeEach(() => {
    mockWithdrawalRepository = {
      findByTransferaTxId: vi.fn(),
      update: vi.fn(),
    } as unknown as WithdrawalRepositoryPort;

    mockLedgerRepository = {
      getEntriesForUser: vi.fn(),
      updateStatus: vi.fn(),
    } as unknown as UserLedgerRepositoryPort;

    useCase = new HandleTransfeeraWebhookUseCase(
      mockWithdrawalRepository,
      mockLedgerRepository
    );
  });

  it("should mark withdrawal as completed when status is FINALIZADO", async () => {
    vi.mocked(mockWithdrawalRepository.findByTransferaTxId).mockResolvedValue(mockWithdrawal);
    vi.mocked(mockLedgerRepository.getEntriesForUser).mockResolvedValue(mockLedgerEntries);

    const completedWithdrawal = {
      ...mockWithdrawal,
      status: WithdrawalStatus.COMPLETED,
      processedAt: expect.any(Date),
    };

    vi.mocked(mockWithdrawalRepository.update).mockResolvedValue(completedWithdrawal);

    await useCase.execute({
      transferId: "transfer-123",
      status: "FINALIZADO",
      eventType: "transfer.completed",
    });

    expect(mockWithdrawalRepository.update).toHaveBeenCalledWith({
      ...mockWithdrawal,
      status: WithdrawalStatus.COMPLETED,
      processedAt: expect.any(Date),
    });

    expect(mockLedgerRepository.updateStatus).toHaveBeenCalledWith({
      ids: ["entry-1", "entry-2"],
      status: LedgerEntryStatus.POSTED,
    });
  });

  it("should mark withdrawal as failed when status is DEVOLVIDO", async () => {
    vi.mocked(mockWithdrawalRepository.findByTransferaTxId).mockResolvedValue(mockWithdrawal);
    vi.mocked(mockLedgerRepository.getEntriesForUser).mockResolvedValue(mockLedgerEntries);

    const failedWithdrawal = {
      ...mockWithdrawal,
      status: WithdrawalStatus.FAILED,
      failureReason: "Transferência devolvida pelo banco",
      processedAt: expect.any(Date),
    };

    vi.mocked(mockWithdrawalRepository.update).mockResolvedValue(failedWithdrawal);

    await useCase.execute({
      transferId: "transfer-123",
      status: "DEVOLVIDO",
      eventType: "transfer.returned",
    });

    expect(mockWithdrawalRepository.update).toHaveBeenCalledWith({
      ...mockWithdrawal,
      status: WithdrawalStatus.FAILED,
      failureReason: "Transferência devolvida pelo banco",
      processedAt: expect.any(Date),
    });

    expect(mockLedgerRepository.updateStatus).toHaveBeenCalledWith({
      ids: ["entry-1", "entry-2"],
      status: LedgerEntryStatus.CANCELED,
    });
  });

  it("should update status to PROCESSING when status is CRIADA", async () => {
    const requestedWithdrawal = {
      ...mockWithdrawal,
      status: WithdrawalStatus.REQUESTED,
    };

    vi.mocked(mockWithdrawalRepository.findByTransferaTxId).mockResolvedValue(requestedWithdrawal);

    const processingWithdrawal = {
      ...requestedWithdrawal,
      status: WithdrawalStatus.PROCESSING,
    };

    vi.mocked(mockWithdrawalRepository.update).mockResolvedValue(processingWithdrawal);

    await useCase.execute({
      transferId: "transfer-123",
      status: "CRIADA",
      eventType: "transfer.created",
    });

    expect(mockWithdrawalRepository.update).toHaveBeenCalledWith({
      ...requestedWithdrawal,
      status: WithdrawalStatus.PROCESSING,
    });
  });

  it("should ignore webhook if withdrawal not found", async () => {
    vi.mocked(mockWithdrawalRepository.findByTransferaTxId).mockResolvedValue(null);

    await useCase.execute({
      transferId: "transfer-999",
      status: "FINALIZADO",
      eventType: "transfer.completed",
    });

    expect(mockWithdrawalRepository.update).not.toHaveBeenCalled();
  });

  it("should ignore webhook if withdrawal already in final status", async () => {
    const completedWithdrawal = {
      ...mockWithdrawal,
      status: WithdrawalStatus.COMPLETED,
      processedAt: new Date(),
    };

    vi.mocked(mockWithdrawalRepository.findByTransferaTxId).mockResolvedValue(completedWithdrawal);

    await useCase.execute({
      transferId: "transfer-123",
      status: "FINALIZADO",
      eventType: "transfer.completed",
    });

    expect(mockWithdrawalRepository.update).not.toHaveBeenCalled();
  });

  it("should handle deprecated FALHA status", async () => {
    vi.mocked(mockWithdrawalRepository.findByTransferaTxId).mockResolvedValue(mockWithdrawal);
    vi.mocked(mockLedgerRepository.getEntriesForUser).mockResolvedValue(mockLedgerEntries);

    const failedWithdrawal = {
      ...mockWithdrawal,
      status: WithdrawalStatus.FAILED,
      failureReason: "Transferência falhou",
      processedAt: expect.any(Date),
    };

    vi.mocked(mockWithdrawalRepository.update).mockResolvedValue(failedWithdrawal);

    await useCase.execute({
      transferId: "transfer-123",
      status: "FALHA",
      eventType: "transfer.failed",
    });

    expect(mockWithdrawalRepository.update).toHaveBeenCalledWith({
      ...mockWithdrawal,
      status: WithdrawalStatus.FAILED,
      failureReason: "Transferência falhou",
      processedAt: expect.any(Date),
    });
  });

  it("should not update ledger if no pending entries found", async () => {
    vi.mocked(mockWithdrawalRepository.findByTransferaTxId).mockResolvedValue(mockWithdrawal);
    vi.mocked(mockLedgerRepository.getEntriesForUser).mockResolvedValue([]);

    const completedWithdrawal = {
      ...mockWithdrawal,
      status: WithdrawalStatus.COMPLETED,
      processedAt: expect.any(Date),
    };

    vi.mocked(mockWithdrawalRepository.update).mockResolvedValue(completedWithdrawal);

    await useCase.execute({
      transferId: "transfer-123",
      status: "FINALIZADO",
      eventType: "transfer.completed",
    });

    expect(mockWithdrawalRepository.update).toHaveBeenCalled();
    expect(mockLedgerRepository.updateStatus).not.toHaveBeenCalled();
  });

  it("should log warning for unknown transfer status", async () => {
    const { logger } = require("../../../../infrastructure/logger");

    vi.mocked(mockWithdrawalRepository.findByTransferaTxId).mockResolvedValue(mockWithdrawal);

    await useCase.execute({
      transferId: "transfer-123",
      status: "UNKNOWN_STATUS",
      eventType: "transfer.unknown",
    });

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        withdrawalId: "withdrawal-123",
        status: "UNKNOWN_STATUS",
      }),
      "Unknown transfer status received from webhook"
    );

    expect(mockWithdrawalRepository.update).not.toHaveBeenCalled();
  });
});

