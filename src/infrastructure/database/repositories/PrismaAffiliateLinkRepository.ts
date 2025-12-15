import { AffiliateLinkRepository } from "../../../ports/repositories/AffiliateLinkRepository";
import { AffiliateLink } from "../../../domain/affiliates/Affiliate";
import { prisma } from "../prismaClient";

export class PrismaAffiliateLinkRepository implements AffiliateLinkRepository {
  async create(link: Omit<AffiliateLink, "id" | "createdAt" | "updatedAt">): Promise<AffiliateLink> {
    const record = await prisma.affiliateLink.create({
      data: {
        affiliateId: link.affiliateId,
        productId: link.productId,
        code: link.code,
        url: link.url,
        clicks: link.clicks,
        conversions: link.conversions,
        active: link.active,
      },
    });

    return this.toDomain(record);
  }

  async findByCode(code: string): Promise<AffiliateLink | null> {
    const record = await prisma.affiliateLink.findUnique({
      where: { code },
    });

    if (!record) {
      return null;
    }

    return this.toDomain(record);
  }

  async findByAffiliateId(affiliateId: string): Promise<AffiliateLink[]> {
    const records = await prisma.affiliateLink.findMany({
      where: { affiliateId },
      orderBy: { createdAt: "desc" },
    });

    return records.map((r) => this.toDomain(r));
  }

  async findByProductId(productId: string): Promise<AffiliateLink[]> {
    const records = await prisma.affiliateLink.findMany({
      where: { productId },
      orderBy: { createdAt: "desc" },
    });

    return records.map((r) => this.toDomain(r));
  }

  async update(link: AffiliateLink): Promise<AffiliateLink> {
    const record = await prisma.affiliateLink.update({
      where: { id: link.id },
      data: {
        url: link.url,
        clicks: link.clicks,
        conversions: link.conversions,
        active: link.active,
        updatedAt: new Date(),
      },
    });

    return this.toDomain(record);
  }

  async incrementClicks(linkId: string): Promise<void> {
    await prisma.affiliateLink.update({
      where: { id: linkId },
      data: {
        clicks: { increment: 1 },
      },
    });
  }

  async incrementConversions(linkId: string): Promise<void> {
    await prisma.affiliateLink.update({
      where: { id: linkId },
      data: {
        conversions: { increment: 1 },
      },
    });
  }

  private toDomain(record: {
    id: string;
    affiliateId: string;
    productId: string;
    code: string;
    url: string;
    clicks: number;
    conversions: number;
    active: boolean;
    createdAt: Date;
    updatedAt: Date;
  }): AffiliateLink {
    return {
      id: record.id,
      affiliateId: record.affiliateId,
      productId: record.productId,
      code: record.code,
      url: record.url,
      clicks: record.clicks,
      conversions: record.conversions,
      active: record.active,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }
}

