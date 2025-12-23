import { prisma } from "../../../infrastructure/database/prismaClient";
import { KycStatus } from "../../../domain/entities/KycStatus";
import { UserKycRepositoryPort } from "../../../ports/UserKycRepositoryPort";

interface RejectKycInput {
  submissionId: string;
  adminUserId: string;
  reason: string;
}

export class RejectKycUseCase {
  constructor(private readonly kycRepository: UserKycRepositoryPort) {}

  async execute(input: RejectKycInput) {
    const submission = await this.kycRepository.findById(input.submissionId);
    if (!submission) {
      throw new Error("KYC submission not found");
    }

    if (submission.status !== KycStatus.PENDING_REVIEW) {
      throw new Error("KYC submission not pending review");
    }

    await this.kycRepository.updateStatus({
      submissionId: input.submissionId,
      status: KycStatus.REJECTED,
      rejectionReason: input.reason,
      reviewedAt: new Date(),
      reviewedByUserId: input.adminUserId,
    });

    const prismaAny = prisma as any;
    await prismaAny.user.update({
      where: { id: submission.userId },
      data: {
        kycStatus: KycStatus.REJECTED,
        kycRejectedAt: new Date(),
      } as any,
    } as any);

    return { success: true };
  }
}

