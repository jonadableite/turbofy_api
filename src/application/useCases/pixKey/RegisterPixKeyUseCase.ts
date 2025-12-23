import { prisma } from "../../../infrastructure/database/prismaClient";
import { onlyDigits } from "../../../utils/brDoc";
import { KycStatus } from "../../../domain/entities/KycStatus";
import { PixKeyStatus } from "../../../domain/entities/PixKeyStatus";
import { UserPixKeyRepositoryPort } from "../../../ports/UserPixKeyRepositoryPort";
import { ValidatePixKeyWithTransfeeraUseCase } from "./ValidatePixKeyWithTransfeeraUseCase";
import { TransfeeraClient } from "../../../infrastructure/adapters/payment/TransfeeraClient";
import { logger } from "../../../infrastructure/logger";

interface RegisterPixKeyInput {
  userId: string;
  type: "CPF" | "CNPJ";
  key: string;
}

export class RegisterPixKeyUseCase {
  constructor(
    private readonly pixKeyRepository: UserPixKeyRepositoryPort,
    private readonly transfeeraClient: TransfeeraClient = new TransfeeraClient()
  ) {}

  async execute(input: RegisterPixKeyInput) {
    const user = await prisma.user.findUnique({ where: { id: input.userId } });
    if (!user) {
      throw new Error("User not found");
    }

    if (user.kycStatus !== KycStatus.APPROVED) {
      throw new Error("KYC not approved");
    }

    if (!user.document) {
      throw new Error("User document not found");
    }

    const normalizedDocument = onlyDigits(user.document);
    const normalizedKey = onlyDigits(input.key);

    // Validação interna: tipo deve corresponder ao documento do usuário
    if (!user.documentType || user.documentType !== input.type) {
      throw new Error("Pix key type must match user document type");
    }

    // Validação interna: chave deve corresponder ao documento
    if (normalizedDocument !== normalizedKey) {
      throw new Error("Pix key must match user document");
    }

    const existing = await this.pixKeyRepository.findByUserId(input.userId);
    if (existing && existing.status === PixKeyStatus.VERIFIED) {
      throw new Error("Pix key already verified for this user");
    }

    // Registrar ou atualizar chave com status PENDING_VERIFICATION
    let pixKey;
    if (existing) {
      pixKey = await this.pixKeyRepository.update({
        ...existing,
        type: input.type,
        key: normalizedKey,
        status: PixKeyStatus.PENDING_VERIFICATION,
        verificationSource: "INTERNAL_MATCH",
        verifiedAt: null,
        rejectedAt: null,
        rejectionReason: null,
      });
    } else {
      pixKey = await this.pixKeyRepository.create({
      userId: input.userId,
      type: input.type,
      key: normalizedKey,
      status: PixKeyStatus.PENDING_VERIFICATION,
      verificationSource: "INTERNAL_MATCH",
    });
    }

    // Validar automaticamente com Transfeera após registro
    try {
      logger.info(
        { userId: input.userId, pixKeyId: pixKey.id },
        "Auto-validating Pix key with Transfeera after registration"
      );

      const validateUseCase = new ValidatePixKeyWithTransfeeraUseCase(
        this.pixKeyRepository,
        this.transfeeraClient
      );

      const validationResult = await validateUseCase.execute({ userId: input.userId });

      logger.info(
        {
          userId: input.userId,
          isValid: validationResult.isValid,
          status: validationResult.status,
        },
        "Pix key auto-validation completed"
      );

      // Retornar chave atualizada após validação
      const updatedPixKey = await this.pixKeyRepository.findByUserId(input.userId);
      return updatedPixKey ?? pixKey;
    } catch (error) {
      // Se a validação automática falhar, apenas logar o erro
      // A chave ficará com status PENDING_VERIFICATION para validação manual posterior
      logger.warn(
        {
          userId: input.userId,
          error: error instanceof Error ? error.message : "Unknown error",
        },
        "Failed to auto-validate Pix key with Transfeera, key remains in PENDING_VERIFICATION"
      );

      return pixKey;
    }
  }
}

