import { randomUUID } from 'crypto';
import { MerchantProfileRepository } from '../../ports/repositories/MerchantProfileRepository';
import { MerchantDocumentRepository } from '../../ports/repositories/MerchantDocumentRepository';
import { MerchantProfile } from '../../domain/entities/MerchantProfile';

export class SubmitForAnalysis {
  constructor(
    private merchantProfileRepository: MerchantProfileRepository,
    private merchantDocumentRepository: MerchantDocumentRepository
  ) {}

  async execute(merchantId: string): Promise<void> {
    const requiredTypes = ['RG_FRONT', 'RG_BACK', 'SELFIE'];
    const documents =
      await this.merchantDocumentRepository.findByMerchantId(
        merchantId
      );

    const uploadedTypes: string[] = documents.map((d) => d.type);
    const missing = requiredTypes.filter(
      (t) => !uploadedTypes.includes(t)
    );

    if (missing.length > 0) {
      throw new Error(`Missing documents: ${missing.join(', ')}`);
    }

    let profile =
      await this.merchantProfileRepository.findByMerchantId(
        merchantId
      );
    if (!profile) {
      // Should exist if user is created, but if not, create it.
      // Assuming Merchant exists.
      profile = new MerchantProfile({
        id: randomUUID(),
        merchantId,
        approvalStatus: 'PENDING',
        onboardingStep: 3, // Assuming step 3 is docs
      });
    }

    profile.requestApproval();
    await this.merchantProfileRepository.save(profile);
  }
}
