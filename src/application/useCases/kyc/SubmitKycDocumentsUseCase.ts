import { prisma } from "../../../infrastructure/database/prismaClient";
import { KycStatus } from "../../../domain/entities/KycStatus";
import {
  UserKycDocumentRecord,
  UserKycRepositoryPort,
} from "../../../ports/UserKycRepositoryPort";

interface SubmitKycDocumentsInput {
  userId: string;
  documents: UserKycDocumentRecord[];
}

export class SubmitKycDocumentsUseCase {
  constructor(private readonly kycRepository: UserKycRepositoryPort) {}

  async execute(input: SubmitKycDocumentsInput) {
    const user = await prisma.user.findUnique({ where: { id: input.userId } });
    if (!user) {
      throw new Error("User not found");
    }

    const userAny = user as any;
    const currentStatus = String(userAny.kycStatus ?? KycStatus.UNVERIFIED);
    if (
      currentStatus !== KycStatus.UNVERIFIED &&
      currentStatus !== KycStatus.REJECTED
    ) {
      throw new Error("KYC already submitted");
    }

    const submission = await this.kycRepository.createSubmission({
      userId: input.userId,
      documents: input.documents,
    });

    const prismaAny = prisma as any;
    await prismaAny.user.update({
      where: { id: input.userId },
      data: {
        kycStatus: KycStatus.PENDING_REVIEW,
        kycSubmittedAt: new Date(),
        kycRejectedAt: null,
      } as any,
    } as any);

    return submission;
  }
}

