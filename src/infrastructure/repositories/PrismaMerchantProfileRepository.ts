import type { PrismaClient } from '@prisma/client';
import { MerchantProfileRepository } from '../../ports/repositories/MerchantProfileRepository';
import {
  MerchantProfile,
  ApprovalStatus,
} from '../../domain/entities/MerchantProfile';

export class PrismaMerchantProfileRepository
  implements MerchantProfileRepository
{
  constructor(private prisma: PrismaClient) {}

  async save(profile: MerchantProfile): Promise<void> {
    await this.prisma.merchantProfile.upsert({
      where: { merchantId: profile.merchantId },
      create: {
        id: profile.id,
        merchantId: profile.merchantId,
        approvalStatus: profile.approvalStatus,
        approvalNotes: profile.props.approvalNotes,
        onboardingStep: profile.props.onboardingStep,
        createdAt: profile.props.createdAt,
        updatedAt: profile.props.updatedAt,
      },
      update: {
        approvalStatus: profile.approvalStatus,
        approvalNotes: profile.props.approvalNotes,
        onboardingStep: profile.props.onboardingStep,
        updatedAt: profile.props.updatedAt,
      },
    });
  }

  async findByMerchantId(
    merchantId: string
  ): Promise<MerchantProfile | null> {
    const data = await this.prisma.merchantProfile.findUnique({
      where: { merchantId },
    });
    if (!data) return null;
    return this.toDomain(data);
  }

  private toDomain(data: any): MerchantProfile {
    return new MerchantProfile({
      id: data.id,
      merchantId: data.merchantId,
      approvalStatus: data.approvalStatus as ApprovalStatus,
      approvalNotes: data.approvalNotes,
      onboardingStep: data.onboardingStep,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    });
  }
}
