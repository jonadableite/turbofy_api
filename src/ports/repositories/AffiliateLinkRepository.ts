import { AffiliateLink } from "../../domain/affiliates/Affiliate";

export interface AffiliateLinkRepository {
  create(link: Omit<AffiliateLink, "id" | "createdAt" | "updatedAt">): Promise<AffiliateLink>;
  findByCode(code: string): Promise<AffiliateLink | null>;
  findByAffiliateId(affiliateId: string): Promise<AffiliateLink[]>;
  findByProductId(productId: string): Promise<AffiliateLink[]>;
  update(link: AffiliateLink): Promise<AffiliateLink>;
  incrementClicks(linkId: string): Promise<void>;
  incrementConversions(linkId: string): Promise<void>;
}

