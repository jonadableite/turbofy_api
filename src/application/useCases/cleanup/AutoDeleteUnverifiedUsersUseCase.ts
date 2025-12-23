import { prisma } from "../../../infrastructure/database/prismaClient";
import { KycStatus } from "../../../domain/entities/KycStatus";

interface AutoDeleteInput {
  cutoffDate: Date;
}

export class AutoDeleteUnverifiedUsersUseCase {
  async execute(input: AutoDeleteInput): Promise<{ deleted: number }> {
    const result = await prisma.user.deleteMany({
      where: {
        kycStatus: { not: KycStatus.APPROVED },
        createdAt: { lte: input.cutoffDate },
      },
    });

    return { deleted: result.count };
  }
}

