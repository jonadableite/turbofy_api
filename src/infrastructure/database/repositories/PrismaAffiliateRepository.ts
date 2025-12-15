import { AffiliateRepository } from "../../../ports/repositories/AffiliateRepository";
import { Affiliate, AffiliateLink } from "../../../domain/affiliates/Affiliate";
import { prisma } from "../prismaClient";

export class PrismaAffiliateRepository implements AffiliateRepository {
  async findById(id: string): Promise<Affiliate | null> {
    const record = await prisma.affiliate.findUnique({
      where: { id },
    });

    if (!record) {
      return null;
    }

    return this.toDomain(record);
  }

  async update(affiliate: Affiliate): Promise<Affiliate> {
    const record = await prisma.affiliate.update({
      where: { id: affiliate.id },
      data: {
        name: affiliate.name,
        email: affiliate.email,
        document: affiliate.document,
        phone: affiliate.phone,
        commissionRate: affiliate.commissionRate,
        active: affiliate.active,
        updatedAt: new Date(),
      },
    });

    return this.toDomain(record);
  }
  async createAffiliate(input: Omit<Affiliate, "id" | "createdAt" | "updatedAt">): Promise<Affiliate> {
    const record = await prisma.affiliate.create({
      data: {
        merchantId: input.merchantId,
        name: input.name,
        email: input.email,
        document: input.document,
        phone: input.phone,
        commissionRate: input.commissionRate,
        active: input.active,
      },
    });

    return this.toDomain(record);
  }

  async listAffiliates(merchantId: string): Promise<Affiliate[]> {
    const records = await prisma.affiliate.findMany({
      where: { merchantId },
      orderBy: { createdAt: "desc" },
    });

    return records.map((r) => this.toDomain(r));
  }

  async createLink(input: Omit<AffiliateLink, "id" | "createdAt" | "updatedAt">): Promise<AffiliateLink> {
    const record = await prisma.affiliateLink.create({
      data: {
        affiliateId: input.affiliateId,
        productId: input.productId,
        code: input.code,
        url: input.url,
        clicks: input.clicks,
        conversions: input.conversions,
        active: input.active,
      },
    });

    return this.toDomainLink(record);
  }

  async listLinksByProduct(productId: string): Promise<AffiliateLink[]> {
    const records = await prisma.affiliateLink.findMany({
      where: { productId },
      orderBy: { createdAt: "desc" },
    });

    return records.map((r) => this.toDomainLink(r));
  }

  private toDomain(record: {
    id: string;
    merchantId: string;
    name: string;
    email: string;
    document: string | null;
    phone: string | null;
    commissionRate: any; // Decimal from Prisma
    active: boolean;
    createdAt: Date;
    updatedAt: Date;
  }): Affiliate {
    return {
      id: record.id,
      merchantId: record.merchantId,
      name: record.name,
      email: record.email,
      document: record.document ?? undefined,
      phone: record.phone ?? undefined,
      commissionRate: Number(record.commissionRate),
      active: record.active,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  private toDomainLink(record: {
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

