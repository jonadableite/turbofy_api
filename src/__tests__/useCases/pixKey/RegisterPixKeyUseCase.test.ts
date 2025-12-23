import { describe, it, expect, beforeEach, vi } from "vitest";
import { RegisterPixKeyUseCase } from "../../../../application/useCases/pixKey/RegisterPixKeyUseCase";
import { UserPixKeyRepositoryPort } from "../../../../ports/UserPixKeyRepositoryPort";
import { TransfeeraClient } from "../../../../infrastructure/adapters/payment/TransfeeraClient";
import { KycStatus } from "../../../../domain/entities/KycStatus";
import { PixKeyStatus } from "../../../../domain/entities/PixKeyStatus";

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

// Mock do ValidatePixKeyWithTransfeeraUseCase
vi.mock("../../../../application/useCases/pixKey/ValidatePixKeyWithTransfeeraUseCase", () => ({
  ValidatePixKeyWithTransfeeraUseCase: vi.fn().mockImplementation(() => ({
    execute: vi.fn(),
  })),
}));

describe("RegisterPixKeyUseCase", () => {
  let mockPixKeyRepository: UserPixKeyRepositoryPort;
  let mockTransfeeraClient: TransfeeraClient;
  let useCase: RegisterPixKeyUseCase;

  const mockUser = {
    id: "user-123",
    email: "test@example.com",
    document: "12345678901",
    documentType: "CPF",
    kycStatus: KycStatus.APPROVED,
  };

  beforeEach(() => {
    mockPixKeyRepository = {
      findByUserId: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    } as unknown as UserPixKeyRepositoryPort;

    mockTransfeeraClient = {
      createValidation: vi.fn(),
    } as unknown as TransfeeraClient;

    useCase = new RegisterPixKeyUseCase(
      mockPixKeyRepository,
      mockTransfeeraClient
    );

    // Mock do prisma.user.findUnique
    const { prisma } = require("../../../../infrastructure/database/prismaClient");
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser);
  });

  it("should register pix key successfully", async () => {
    vi.mocked(mockPixKeyRepository.findByUserId).mockResolvedValue(null);

    const newPixKey = {
      id: "pixkey-123",
      userId: "user-123",
      type: "CPF" as const,
      key: "12345678901",
      status: PixKeyStatus.PENDING_VERIFICATION,
      verificationSource: "INTERNAL_MATCH",
      createdAt: new Date(),
      verifiedAt: null,
      rejectedAt: null,
      rejectionReason: null,
    };

    vi.mocked(mockPixKeyRepository.create).mockResolvedValue(newPixKey);

    // Mock do ValidatePixKeyWithTransfeeraUseCase
    const { ValidatePixKeyWithTransfeeraUseCase } = require("../../../../application/useCases/pixKey/ValidatePixKeyWithTransfeeraUseCase");
    const mockValidateUseCase = new ValidatePixKeyWithTransfeeraUseCase();
    vi.mocked(mockValidateUseCase.execute).mockResolvedValue({
      isValid: true,
      status: PixKeyStatus.VERIFIED,
      recipientName: "João da Silva",
    });

    const result = await useCase.execute({
      userId: "user-123",
      type: "CPF",
      key: "123.456.789-01",
    });

    expect(mockPixKeyRepository.create).toHaveBeenCalledWith({
      userId: "user-123",
      type: "CPF",
      key: "12345678901",
      status: PixKeyStatus.PENDING_VERIFICATION,
      verificationSource: "INTERNAL_MATCH",
    });

    expect(result).toBeDefined();
  });

  it("should update existing pix key", async () => {
    const existingPixKey = {
      id: "pixkey-123",
      userId: "user-123",
      type: "CPF" as const,
      key: "99999999999",
      status: PixKeyStatus.REJECTED,
      verificationSource: "INTERNAL_MATCH",
      createdAt: new Date(),
      verifiedAt: null,
      rejectedAt: new Date(),
      rejectionReason: "Invalid",
    };

    vi.mocked(mockPixKeyRepository.findByUserId).mockResolvedValue(existingPixKey);

    const updatedPixKey = {
      ...existingPixKey,
      key: "12345678901",
      status: PixKeyStatus.PENDING_VERIFICATION,
      rejectedAt: null,
      rejectionReason: null,
    };

    vi.mocked(mockPixKeyRepository.update).mockResolvedValue(updatedPixKey);

    // Mock do ValidatePixKeyWithTransfeeraUseCase
    const { ValidatePixKeyWithTransfeeraUseCase } = require("../../../../application/useCases/pixKey/ValidatePixKeyWithTransfeeraUseCase");
    const mockValidateUseCase = new ValidatePixKeyWithTransfeeraUseCase();
    vi.mocked(mockValidateUseCase.execute).mockRejectedValue(new Error("Validation failed"));

    const result = await useCase.execute({
      userId: "user-123",
      type: "CPF",
      key: "12345678901",
    });

    expect(mockPixKeyRepository.update).toHaveBeenCalled();
    expect(result.key).toBe("12345678901");
  });

  it("should throw error if user not found", async () => {
    const { prisma } = require("../../../../infrastructure/database/prismaClient");
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

    await expect(
      useCase.execute({
        userId: "user-123",
        type: "CPF",
        key: "12345678901",
      })
    ).rejects.toThrow("User not found");
  });

  it("should throw error if KYC not approved", async () => {
    const { prisma } = require("../../../../infrastructure/database/prismaClient");
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      ...mockUser,
      kycStatus: KycStatus.PENDING,
    });

    await expect(
      useCase.execute({
        userId: "user-123",
        type: "CPF",
        key: "12345678901",
      })
    ).rejects.toThrow("KYC not approved");
  });

  it("should throw error if user document not found", async () => {
    const { prisma } = require("../../../../infrastructure/database/prismaClient");
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      ...mockUser,
      document: null,
    });

    await expect(
      useCase.execute({
        userId: "user-123",
        type: "CPF",
        key: "12345678901",
      })
    ).rejects.toThrow("User document not found");
  });

  it("should throw error if pix key type does not match user document type", async () => {
    const { prisma } = require("../../../../infrastructure/database/prismaClient");
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      ...mockUser,
      documentType: "CNPJ",
    });

    await expect(
      useCase.execute({
        userId: "user-123",
        type: "CPF",
        key: "12345678901",
      })
    ).rejects.toThrow("Pix key type must match user document type");
  });

  it("should throw error if pix key does not match user document", async () => {
    await expect(
      useCase.execute({
        userId: "user-123",
        type: "CPF",
        key: "99999999999",
      })
    ).rejects.toThrow("Pix key must match user document");
  });

  it("should throw error if pix key already verified", async () => {
    const verifiedPixKey = {
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

    vi.mocked(mockPixKeyRepository.findByUserId).mockResolvedValue(verifiedPixKey);

    await expect(
      useCase.execute({
        userId: "user-123",
        type: "CPF",
        key: "12345678901",
      })
    ).rejects.toThrow("Pix key already verified for this user");
  });
});

