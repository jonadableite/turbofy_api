import { prisma } from "../../../infrastructure/database/prismaClient";
import { onlyDigits } from "../../../utils/brDoc";
import { KycStatus } from "../../../domain/entities/KycStatus";
import { PixKeyStatus } from "../../../domain/entities/PixKeyStatus";
import { UserPixKeyRepositoryPort } from "../../../ports/UserPixKeyRepositoryPort";

interface RegisterPixKeyInput {
  userId: string;
  type: "CPF" | "CNPJ";
  key: string;
}

export class RegisterPixKeyUseCase {
  constructor(private readonly pixKeyRepository: UserPixKeyRepositoryPort) {}

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

    if (!user.documentType || user.documentType !== input.type) {
      throw new Error("Pix key type must match user document type");
    }

    if (normalizedDocument !== normalizedKey) {
      throw new Error("Pix key must match user document");
    }

    const existing = await this.pixKeyRepository.findByUserId(input.userId);
    if (existing && existing.status === PixKeyStatus.VERIFIED) {
      throw new Error("Pix key already verified for this user");
    }

    if (existing) {
      return this.pixKeyRepository.update({
        ...existing,
        type: input.type,
        key: normalizedKey,
        status: PixKeyStatus.PENDING_VERIFICATION,
        verificationSource: "INTERNAL_MATCH",
        verifiedAt: null,
        rejectedAt: null,
        rejectionReason: null,
      });
    }

    return this.pixKeyRepository.create({
      userId: input.userId,
      type: input.type,
      key: normalizedKey,
      status: PixKeyStatus.PENDING_VERIFICATION,
      verificationSource: "INTERNAL_MATCH",
    });
  }
}

