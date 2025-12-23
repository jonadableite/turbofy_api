import { describe, it, expect, beforeEach, vi } from "vitest";
import { ProcessWithdrawalUseCase } from "../../../../application/useCases/balance/ProcessWithdrawalUseCase";
import { UserLedgerRepositoryPort } from "../../../../ports/UserLedgerRepositoryPort";
import { UserPixKeyRepositoryPort } from "../../../../ports/UserPixKeyRepositoryPort";
import { WithdrawalRepositoryPort } from "../../../../ports/WithdrawalRepositoryPort";
import { TransfeeraClient } from "../../../../infrastructure/adapters/payment/TransfeeraClient";
import { WithdrawalStatus } from "../../../../domain/entities/WithdrawalStatus";
import { PixKeyStatus } from "../../../../domain/entities/PixKeyStatus";
import { LedgerEntryStatus, LedgerEntryType } from "../../../../domain/entities/LedgerEntryType";

// Mock do logger
vi.mock("../../../../infrastructure/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock do Prisma
vi.mock("../../../../infrastructure/database/prismaClient", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
  },
}));

describe("ProcessWithdrawalUseCase", () => {
  let mockLedgerRepository: UserLedgerRepositoryPort;
  let mockPixKeyRepository: UserPixKeyRepositoryPort;
  let mockWithdrawalRepository: WithdrawalRepositoryPort;
  let mockTransfeeraClient: TransfeeraClient;
  let useCase: ProcessWithdrawalUseCase;

  const mockUser = {
    id: "user-123",
    email: "test@example.com",
    document: "12345678901",
    documentType: "CPF",
    kycStatus: "APPROVED",
  };

  const mockPixKey = {
    id: "pixkey-123",
    userId: "user-123",
    type: "CPF" as const,
    key: "12345678901",
    status: PixKeyStatus.VERIFIED,
    verificationSource: "TRANSFEERA_API",
    createdAt: new Date(),
    verifiedAt: new Date(),
    rejectedAt: null,
    rejectionReason: null,
  };

  const mockWithdrawal = {
    id: "withdrawal-123",
    userId: "user-123",
    amountCents: 10000,
    feeCents: 150,
    totalDebitedCents: 10150,
    status: WithdrawalStatus.REQUESTED,
    transferaTxId: null,
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
    mockLedgerRepository = {
      getEntriesForUser: vi.fn(),
      updateStatus: vi.fn(),
    } as unknown as UserLedgerRepositoryPort;

    mockPixKeyRepository = {
      findByUserId: vi.fn(),
    } as unknown as UserPixKeyRepositoryPort;

    mockWithdrawalRepository = {
      findById: vi.fn(),
      update: vi.fn(),
    } as unknown as WithdrawalRepositoryPort;

    mockTransfeeraClient = {
      createBatch: vi.fn(),
      createTransfer: vi.fn(),
    } as unknown as TransfeeraClient;

    useCase = new ProcessWithdrawalUseCase(
      mockLedgerRepository,
      mockPixKeyRepository,
      mockWithdrawalRepository,
      mockTransfeeraClient
    );

    // Mock do prisma.user.findUnique
    const { prisma } = require("../../../../infrastructure/database/prismaClient");
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser);
  });

  it("should process withdrawal successfully", async () => {
    vi.mocked(mockWithdrawalRepository.findById).mockResolvedValue(mockWithdrawal);
    vi.mocked(mockPixKeyRepository.findByUserId).mockResolvedValue(mockPixKey);
    vi.mocked(mockLedgerRepository.getEntriesForUser).mockResolvedValue(mockLedgerEntries);

    vi.mocked(mockTransfeeraClient.createBatch).mockResolvedValue({
      id: "batch-123",
      name: "Saque Turbofy #withdrawal",
      status: "ACTIVE",
    } as any);

    vi.mocked(mockTransfeeraClient.createTransfer).mockResolvedValue({
      id: "transfer-123",
      status: "COMPLETED",
      value: 100,
    } as any);

    const completedWithdrawal = {
      ...mockWithdrawal,
      status: WithdrawalStatus.COMPLETED,
      transferaTxId: "transfer-123",
      processedAt: new Date(),
    };

    vi.mocked(mockWithdrawalRepository.update).mockResolvedValue(completedWithdrawal);

    const result = await useCase.execute({ withdrawalId: "withdrawal-123" });

    expect(result.status).toBe(WithdrawalStatus.COMPLETED);
    expect(result.transferaTxId).toBe("transfer-123");

    expect(mockTransfeeraClient.createBatch).toHaveBeenCalledWith({
      type: "TRANSFERENCIA",
      autoClose: true,
      name: expect.stringContaining("Saque Turbofy"),
    });

    expect(mockTransfeeraClient.createTransfer).toHaveBeenCalledWith("batch-123", {
      value: 100,
      idempotency_key: "idempotency-123",
      pix_description: expect.stringContaining("Saque Turbofy"),
      destination_bank_account: {
        pix_key_type: "CPF",
        pix_key: "12345678901",
      },
      pix_key_validation: {
        cpf_cnpj: "12345678901",
      },
    });

    expect(mockLedgerRepository.updateStatus).toHaveBeenCalledWith({
      ids: ["entry-1", "entry-2"],
      status: LedgerEntryStatus.POSTED,
    });
  });

  it("should handle failed withdrawal", async () => {
    vi.mocked(mockWithdrawalRepository.findById).mockResolvedValue(mockWithdrawal);
    vi.mocked(mockPixKeyRepository.findByUserId).mockResolvedValue(mockPixKey);
    vi.mocked(mockLedgerRepository.getEntriesForUser).mockResolvedValue(mockLedgerEntries);

    vi.mocked(mockTransfeeraClient.createBatch).mockResolvedValue({
      id: "batch-123",
      name: "Saque Turbofy",
      status: "ACTIVE",
    } as any);

    vi.mocked(mockTransfeeraClient.createTransfer).mockResolvedValue({
      id: "transfer-123",
      status: "FAILED",
      error: {
        message: "Insufficient funds",
      },
    } as any);

    const failedWithdrawal = {
      ...mockWithdrawal,
      status: WithdrawalStatus.FAILED,
      failureReason: "Insufficient funds",
      processedAt: new Date(),
    };

    vi.mocked(mockWithdrawalRepository.update).mockResolvedValue(failedWithdrawal);

    const result = await useCase.execute({ withdrawalId: "withdrawal-123" });

    expect(result.status).toBe(WithdrawalStatus.FAILED);
    expect(result.failureReason).toBe("Insufficient funds");

    expect(mockLedgerRepository.updateStatus).toHaveBeenCalledWith({
      ids: ["entry-1", "entry-2"],
      status: LedgerEntryStatus.CANCELED,
    });
  });

  it("should return withdrawal if already completed", async () => {
    const completedWithdrawal = {
      ...mockWithdrawal,
      status: WithdrawalStatus.COMPLETED,
      processedAt: new Date(),
    };

    vi.mocked(mockWithdrawalRepository.findById).mockResolvedValue(completedWithdrawal);

    const result = await useCase.execute({ withdrawalId: "withdrawal-123" });

    expect(result.status).toBe(WithdrawalStatus.COMPLETED);
    expect(mockTransfeeraClient.createBatch).not.toHaveBeenCalled();
  });

  it("should throw error if withdrawal not found", async () => {
    vi.mocked(mockWithdrawalRepository.findById).mockResolvedValue(null);

    await expect(
      useCase.execute({ withdrawalId: "withdrawal-123" })
    ).rejects.toThrow("Withdrawal not found");
  });

  it("should throw error if user not found", async () => {
    vi.mocked(mockWithdrawalRepository.findById).mockResolvedValue(mockWithdrawal);

    const { prisma } = require("../../../../infrastructure/database/prismaClient");
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

    await expect(
      useCase.execute({ withdrawalId: "withdrawal-123" })
    ).rejects.toThrow("User not found");
  });

  it("should throw error if pix key not found", async () => {
    vi.mocked(mockWithdrawalRepository.findById).mockResolvedValue(mockWithdrawal);
    vi.mocked(mockPixKeyRepository.findByUserId).mockResolvedValue(null);

    await expect(
      useCase.execute({ withdrawalId: "withdrawal-123" })
    ).rejects.toThrow("Pix key not found");
  });

  it("should throw error if user document not found", async () => {
    vi.mocked(mockWithdrawalRepository.findById).mockResolvedValue(mockWithdrawal);
    vi.mocked(mockPixKeyRepository.findByUserId).mockResolvedValue(mockPixKey);

    const { prisma } = require("../../../../infrastructure/database/prismaClient");
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      ...mockUser,
      document: null,
    });

    await expect(
      useCase.execute({ withdrawalId: "withdrawal-123" })
    ).rejects.toThrow("User document not found");
  });
});

