import { prisma } from "../../../infrastructure/database/prismaClient";
import { KycStatus } from "../../../domain/entities/KycStatus";

interface AutoDeleteInput {
  cutoffDate: Date;
}

export class AutoDeleteUnverifiedUsersUseCase {
  async execute(input: AutoDeleteInput): Promise<{ deleted: number }> {
    const prismaAny = prisma as any;
    const result = await prismaAny.user.deleteMany({
      where: {
        kycStatus: { not: KycStatus.APPROVED },
        createdAt: { lte: input.cutoffDate },
      } as any,
    });

    return { deleted: result.count };
  }
}

