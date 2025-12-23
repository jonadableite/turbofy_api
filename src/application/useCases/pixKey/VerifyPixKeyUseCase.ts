import { prisma } from "../../../infrastructure/database/prismaClient";
import { onlyDigits } from "../../../utils/brDoc";
import { PixKeyStatus } from "../../../domain/entities/PixKeyStatus";
import { UserPixKeyRepositoryPort } from "../../../ports/UserPixKeyRepositoryPort";

interface VerifyPixKeyInput {
  userId: string;
}

export class VerifyPixKeyUseCase {
  constructor(private readonly pixKeyRepository: UserPixKeyRepositoryPort) {}

  async execute(input: VerifyPixKeyInput) {
    const user = await prisma.user.findUnique({ where: { id: input.userId } });
    if (!user) {
      throw new Error("User not found");
    }

    const pixKey = await this.pixKeyRepository.findByUserId(input.userId);
    if (!pixKey) {
      throw new Error("Pix key not found");
    }

    const normalizedDocument = onlyDigits(user.document ?? "");
    if (pixKey.key !== normalizedDocument) {
      throw new Error("Pix key does not match user document");
    }

    if (pixKey.status === PixKeyStatus.VERIFIED) {
      return pixKey;
    }

    const updated = await this.pixKeyRepository.update({
      ...pixKey,
      status: PixKeyStatus.VERIFIED,
      verifiedAt: new Date(),
      rejectedAt: null,
      rejectionReason: null,
      verificationSource: pixKey.verificationSource ?? "INTERNAL_MATCH",
    });

    return updated;
  }
}

