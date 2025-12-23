import { describe, it, expect, beforeEach, vi } from "vitest";
import { ValidatePixKeyWithTransfeeraUseCase } from "../../../../application/useCases/pixKey/ValidatePixKeyWithTransfeeraUseCase";
import { UserPixKeyRepositoryPort } from "../../../../ports/UserPixKeyRepositoryPort";
import { TransfeeraClient } from "../../../../infrastructure/adapters/payment/TransfeeraClient";
import { PixKeyStatus } from "../../../../domain/entities/PixKeyStatus";

// Mock do logger
vi.mock("../../../../infrastructure/logger", () => ({
  logger: {
    info: vi.fn(),
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

describe("ValidatePixKeyWithTransfeeraUseCase", () => {
  let mockPixKeyRepository: UserPixKeyRepositoryPort;
  let mockTransfeeraClient: TransfeeraClient;
  let useCase: ValidatePixKeyWithTransfeeraUseCase;

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
    status: PixKeyStatus.PENDING_VERIFICATION,
    verificationSource: "INTERNAL_MATCH",
    createdAt: new Date(),
    verifiedAt: null,
    rejectedAt: null,
    rejectionReason: null,
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

    useCase = new ValidatePixKeyWithTransfeeraUseCase(
      mockPixKeyRepository,
      mockTransfeeraClient
    );

    // Mock do prisma.user.findUnique
    const { prisma } = require("../../../../infrastructure/database/prismaClient");
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser);
  });

  it("should validate pix key successfully with Transfeera", async () => {
    vi.mocked(mockPixKeyRepository.findByUserId).mockResolvedValue(mockPixKey);

    vi.mocked(mockTransfeeraClient.createValidation).mockResolvedValue({
      id: "validation-123",
      valid: true,
      errors: [],
      data: {
        name: "João da Silva",
      },
    } as any);

    const updatedPixKey = {
      ...mockPixKey,
      status: PixKeyStatus.VERIFIED,
      verifiedAt: new Date(),
      verificationSource: "TRANSFEERA_API",
    };

    vi.mocked(mockPixKeyRepository.update).mockResolvedValue(updatedPixKey);

    const result = await useCase.execute({ userId: "user-123" });

    expect(result.isValid).toBe(true);
    expect(result.status).toBe(PixKeyStatus.VERIFIED);
    expect(result.recipientName).toBe("João da Silva");
    expect(mockTransfeeraClient.createValidation).toHaveBeenCalledWith("BASICA", {
      pix_key: "12345678901",
      pix_key_type: "CPF",
      pix_key_validation: {
        cpf_cnpj: "12345678901",
      },
    });
    expect(mockPixKeyRepository.update).toHaveBeenCalledWith({
      ...mockPixKey,
      status: PixKeyStatus.VERIFIED,
      verifiedAt: expect.any(Date),
      rejectedAt: null,
      rejectionReason: null,
      verificationSource: "TRANSFEERA_API",
    });
  });

  it("should reject pix key when Transfeera validation fails", async () => {
    vi.mocked(mockPixKeyRepository.findByUserId).mockResolvedValue(mockPixKey);

    vi.mocked(mockTransfeeraClient.createValidation).mockResolvedValue({
      id: "validation-123",
      valid: false,
      errors: [
        {
          message: "Chave Pix não encontrada no DICT",
          errorCode: "PIX_KEY_NOT_FOUND",
        },
      ],
      data: null,
    } as any);

    const updatedPixKey = {
      ...mockPixKey,
      status: PixKeyStatus.REJECTED,
      rejectedAt: new Date(),
      rejectionReason: "[PIX_KEY_NOT_FOUND] Chave Pix não encontrada no DICT",
      verificationSource: "TRANSFEERA_API",
    };

    vi.mocked(mockPixKeyRepository.update).mockResolvedValue(updatedPixKey);

    const result = await useCase.execute({ userId: "user-123" });

    expect(result.isValid).toBe(false);
    expect(result.status).toBe(PixKeyStatus.REJECTED);
    expect(result.error).toBe("Chave Pix não encontrada no DICT");
    expect(mockPixKeyRepository.update).toHaveBeenCalledWith({
      ...mockPixKey,
      status: PixKeyStatus.REJECTED,
      verifiedAt: null,
      rejectedAt: expect.any(Date),
      rejectionReason: "[PIX_KEY_NOT_FOUND] Chave Pix não encontrada no DICT",
      verificationSource: "TRANSFEERA_API",
    });
  });

  it("should throw error if user not found", async () => {
    const { prisma } = require("../../../../infrastructure/database/prismaClient");
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

    await expect(useCase.execute({ userId: "user-123" })).rejects.toThrow(
      "User not found"
    );
  });

  it("should throw error if pix key not found", async () => {
    vi.mocked(mockPixKeyRepository.findByUserId).mockResolvedValue(null);

    await expect(useCase.execute({ userId: "user-123" })).rejects.toThrow(
      "Pix key not found"
    );
  });

  it("should throw error if user document not found", async () => {
    const { prisma } = require("../../../../infrastructure/database/prismaClient");
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      ...mockUser,
      document: null,
    });

    await expect(useCase.execute({ userId: "user-123" })).rejects.toThrow(
      "User document not found"
    );
  });

  it("should throw error if Transfeera API fails", async () => {
    vi.mocked(mockPixKeyRepository.findByUserId).mockResolvedValue(mockPixKey);

    vi.mocked(mockTransfeeraClient.createValidation).mockRejectedValue(
      new Error("Transfeera API error")
    );

    await expect(useCase.execute({ userId: "user-123" })).rejects.toThrow(
      "Erro ao validar chave Pix com Transfeera: Transfeera API error"
    );
  });
});

