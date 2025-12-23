import { prisma } from "../../../infrastructure/database/prismaClient";
import { onlyDigits } from "../../../utils/brDoc";
import { PixKeyStatus } from "../../../domain/entities/PixKeyStatus";
import { UserPixKeyRepositoryPort } from "../../../ports/UserPixKeyRepositoryPort";
import { ValidatePixKeyWithTransfeeraUseCase } from "./ValidatePixKeyWithTransfeeraUseCase";
import { TransfeeraClient } from "../../../infrastructure/adapters/payment/TransfeeraClient";

interface VerifyPixKeyInput {
  userId: string;
}

export class VerifyPixKeyUseCase {
  constructor(
    private readonly pixKeyRepository: UserPixKeyRepositoryPort,
    private readonly transfeeraClient: TransfeeraClient = new TransfeeraClient()
  ) {}

  async execute(input: VerifyPixKeyInput) {
    const user = await prisma.user.findUnique({ where: { id: input.userId } });
    if (!user) {
      throw new Error("User not found");
    }

    const pixKey = await this.pixKeyRepository.findByUserId(input.userId);
    if (!pixKey) {
      throw new Error("Pix key not found");
    }

    // Validação interna: chave deve corresponder ao documento
    const normalizedDocument = onlyDigits(user.document ?? "");
    if (pixKey.key !== normalizedDocument) {
      throw new Error("Pix key does not match user document");
    }

    // Se já está verificada, retornar
    if (pixKey.status === PixKeyStatus.VERIFIED) {
      return pixKey;
    }

    // Validar com Transfeera Conta Certa
    const validateUseCase = new ValidatePixKeyWithTransfeeraUseCase(
      this.pixKeyRepository,
      this.transfeeraClient
    );

    const result = await validateUseCase.execute({ userId: input.userId });

    if (!result.isValid) {
      throw new Error(`Validação falhou: ${result.error ?? "Chave Pix inválida"}`);
    }

    // Retornar chave atualizada
    const updated = await this.pixKeyRepository.findByUserId(input.userId);
    if (!updated) {
      throw new Error("Pix key not found after validation");
    }

    return updated;
  }
}

