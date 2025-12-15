
import { MerchantProfileRepository } from '../../ports/repositories/MerchantProfileRepository';
import { MerchantDocumentRepository } from '../../ports/repositories/MerchantDocumentRepository';

export interface ReviewMerchantProfileInput {
  merchantId: string;
  adminId: string;
  action: 'APPROVE' | 'REJECT' | 'REQUEST_CHANGES';
  reason?: string;
  documentReviews?: {
    documentType: string;
    action: 'APPROVE' | 'REJECT';
    reason?: string;
  }[];
}

export class ReviewMerchantProfile {
  constructor(
    private merchantProfileRepository: MerchantProfileRepository,
    private merchantDocumentRepository: MerchantDocumentRepository
  ) {}

  async execute(input: ReviewMerchantProfileInput): Promise<void> {
    const profile = await this.merchantProfileRepository.findByMerchantId(input.merchantId);
    if (!profile) {
      throw new Error('Profile not found');
    }

    // Update specific documents if reviews provided
    if (input.documentReviews) {
      for (const review of input.documentReviews) {
        const doc = await this.merchantDocumentRepository.findByMerchantIdAndType(
          input.merchantId,
          review.documentType
        );
        if (doc) {
          if (review.action === 'APPROVE') {
            doc.approve(input.adminId);
          } else {
            doc.reject(input.adminId, review.reason || 'Document rejected');
          }
          await this.merchantDocumentRepository.save(doc);
        }
      }
    }

    // Update Profile Status
    if (input.action === 'APPROVE') {
      // Verify all docs are approved? Or implicit?
      // For simplicity, we trust the admin's overall action.
      profile.approve();
      profile.advanceStep(4); // Completed
    } else if (input.action === 'REJECT') {
      profile.reject(input.reason || 'Application rejected');
    } else if (input.action === 'REQUEST_CHANGES') {
      profile.requestChanges(input.reason || 'Please fix the flagged documents.');
    }

    await this.merchantProfileRepository.save(profile);
    
    // TODO: Trigger email notification event here
  }
}

