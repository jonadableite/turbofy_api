import { prisma } from "../../../infrastructure/database/prismaClient";
import { KycStatus } from "../../../domain/entities/KycStatus";
import { UserKycRepositoryPort } from "../../../ports/UserKycRepositoryPort";

interface ApproveKycInput {
  submissionId: string;
  adminUserId: string;
}

export class ApproveKycUseCase {
  constructor(private readonly kycRepository: UserKycRepositoryPort) {}

  async execute(input: ApproveKycInput) {
    const submission = await this.kycRepository.findById(input.submissionId);
    if (!submission) {
      throw new Error("KYC submission not found");
    }

    if (submission.status !== KycStatus.PENDING_REVIEW) {
      throw new Error("KYC submission not pending review");
    }

    await this.kycRepository.updateStatus({
      submissionId: input.submissionId,
      status: KycStatus.APPROVED,
      reviewedAt: new Date(),
      reviewedByUserId: input.adminUserId,
    });

    await prisma.user.update({
      where: { id: submission.userId },
      data: {
        kycStatus: KycStatus.APPROVED,
        kycApprovedAt: new Date(),
      },
    });

    return { success: true };
  }
}

