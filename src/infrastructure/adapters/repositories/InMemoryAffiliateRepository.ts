import {
  Affiliate,
  AffiliateLink,
} from '../../../domain/affiliates/Affiliate';
import { AffiliateRepository } from '../../../ports/repositories/AffiliateRepository';

export class InMemoryAffiliateRepository
  implements AffiliateRepository
{
  private affiliates: Affiliate[] = [];
  private links: AffiliateLink[] = [];

  async createAffiliate(
    input: Omit<Affiliate, 'id' | 'createdAt'>
  ): Promise<Affiliate> {
    const now = new Date();
    const entity: Affiliate = {
      id: crypto.randomUUID(),
      createdAt: now,
      ...input,
    };
    this.affiliates.push(entity);
    return entity;
  }

  async listAffiliates(merchantId: string): Promise<Affiliate[]> {
    return this.affiliates.filter((a) => a.merchantId === merchantId);
  }

  async findById(id: string): Promise<Affiliate | null> {
    return this.affiliates.find((a) => a.id === id) || null;
  }

  async update(affiliate: Affiliate): Promise<Affiliate> {
    const index = this.affiliates.findIndex(
      (a) => a.id === affiliate.id
    );
    if (index === -1) throw new Error('Affiliate not found');
    this.affiliates[index] = affiliate;
    return affiliate;
  }

  async createLink(
    input: Omit<AffiliateLink, 'id' | 'createdAt'>
  ): Promise<AffiliateLink> {
    const now = new Date();
    const entity: AffiliateLink = {
      id: crypto.randomUUID(),
      createdAt: now,
      ...input,
    };
    this.links.push(entity);
    return entity;
  }

  async listLinksByProduct(
    productId: string
  ): Promise<AffiliateLink[]> {
    return this.links.filter((l) => l.productId === productId);
  }
}
