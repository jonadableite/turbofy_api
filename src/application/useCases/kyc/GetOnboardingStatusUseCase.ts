import { prisma } from "../../../infrastructure/database/prismaClient";
import { UserKycRepositoryPort } from "../../../ports/UserKycRepositoryPort";

interface GetOnboardingStatusInput {
  userId: string;
}

export class GetOnboardingStatusUseCase {
  constructor(private readonly kycRepository: UserKycRepositoryPort) {}

  async execute(input: GetOnboardingStatusInput) {
    const prismaAny = prisma as any;
    const user = await prismaAny.user.findUnique({
      where: { id: input.userId },
      select: {
        id: true,
        kycStatus: true,
        kycSubmittedAt: true,
        kycApprovedAt: true,
        kycRejectedAt: true,
      },
    } as any);

    if (!user) {
      throw new Error("User not found");
    }

    const latestSubmission = await this.kycRepository.findLatestByUserId(input.userId);

    return {
      user,
      latestSubmission,
    };
  }
}

