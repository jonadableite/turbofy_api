import { TransfeeraClient } from "../../../infrastructure/adapters/payment/TransfeeraClient";
import { UserPixKeyRepositoryPort } from "../../../ports/UserPixKeyRepositoryPort";
import { PixKeyStatus } from "../../../domain/entities/PixKeyStatus";
import { logger } from "../../../infrastructure/logger";
import { prisma } from "../../../infrastructure/database/prismaClient";
import { onlyDigits } from "../../../utils/brDoc";

interface ValidatePixKeyWithTransfeeraInput {
  userId: string;
}

interface ValidatePixKeyWithTransfeeraOutput {
  isValid: boolean;
  recipientName?: string;
  error?: string;
  status: PixKeyStatus;
}

export class ValidatePixKeyWithTransfeeraUseCase {
  constructor(
    private readonly pixKeyRepository: UserPixKeyRepositoryPort,
    private readonly transfeeraClient: TransfeeraClient = new TransfeeraClient()
  ) {}

  async execute(input: ValidatePixKeyWithTransfeeraInput): Promise<ValidatePixKeyWithTransfeeraOutput> {
    const user = await prisma.user.findUnique({ where: { id: input.userId } });
    if (!user) {
      throw new Error("User not found");
    }

    const pixKey = await this.pixKeyRepository.findByUserId(input.userId);
    if (!pixKey) {
      throw new Error("Pix key not found");
    }

    if (!user.document) {
      throw new Error("User document not found");
    }

    const normalizedDocument = onlyDigits(user.document);

    try {
      logger.info(
        {
          userId: input.userId,
          pixKeyType: pixKey.type,
          pixKey: pixKey.key,
        },
        "Validating Pix key with Transfeera Conta Certa"
      );

      // Chamar Transfeera Conta Certa para validar a chave
      const validation = await this.transfeeraClient.createValidation("BASICA", {
        pix_key: pixKey.key,
        pix_key_type: pixKey.type as "EMAIL" | "CPF" | "CNPJ" | "TELEFONE" | "CHAVE_ALEATORIA",
        pix_key_validation: {
          cpf_cnpj: normalizedDocument,
        },
      });

      logger.info(
        {
          userId: input.userId,
          validationId: validation.id,
          valid: validation.valid,
          errors: validation.errors,
        },
        "Transfeera validation response"
      );

      // Se a validação foi bem-sucedida
      if (validation.valid) {
        await this.pixKeyRepository.update({
          ...pixKey,
          status: PixKeyStatus.VERIFIED,
          verifiedAt: new Date(),
          rejectedAt: null,
          rejectionReason: null,
          verificationSource: "TRANSFEERA_API",
        });

        return {
          isValid: true,
          recipientName: validation.data?.name as string | undefined,
          status: PixKeyStatus.VERIFIED,
        };
      }

      // Se a validação falhou
      const errorMessages = validation.errors.map((e) => e.message).join("; ");
      const errorCodes = validation.errors.map((e) => e.errorCode).filter(Boolean).join("; ");

      await this.pixKeyRepository.update({
        ...pixKey,
        status: PixKeyStatus.REJECTED,
        verifiedAt: null,
        rejectedAt: new Date(),
        rejectionReason: `${errorCodes ? `[${errorCodes}] ` : ""}${errorMessages}`,
        verificationSource: "TRANSFEERA_API",
      });

      return {
        isValid: false,
        error: errorMessages,
        status: PixKeyStatus.REJECTED,
      };
    } catch (error) {
      logger.error(
        {
          userId: input.userId,
          error: error instanceof Error ? error.message : "Unknown error",
          stack: error instanceof Error ? error.stack : undefined,
        },
        "Error validating Pix key with Transfeera"
      );

      // Se houver erro na comunicação com Transfeera, manter como PENDING_VERIFICATION
      throw new Error(
        `Erro ao validar chave Pix com Transfeera: ${error instanceof Error ? error.message : "Erro desconhecido"}`
      );
    }
  }
}

