import { Affiliate, AffiliateLink } from "../../domain/affiliates/Affiliate";

export interface AffiliateRepository {
  createAffiliate(input: Omit<Affiliate, "id" | "createdAt" | "updatedAt">): Promise<Affiliate>;
  listAffiliates(merchantId: string): Promise<Affiliate[]>;
  findById(id: string): Promise<Affiliate | null>;
  update(affiliate: Affiliate): Promise<Affiliate>;
  createLink(input: Omit<AffiliateLink, "id" | "createdAt" | "updatedAt">): Promise<AffiliateLink>;
  listLinksByProduct(productId: string): Promise<AffiliateLink[]>;
}