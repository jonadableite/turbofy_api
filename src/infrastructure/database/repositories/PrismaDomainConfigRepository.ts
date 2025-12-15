import { prisma } from "../prismaClient";
import { DomainConfigRepository, DomainConfig } from "../../../ports/repositories/DomainConfigRepository";

export class PrismaDomainConfigRepository implements DomainConfigRepository {
  async findByMerchantId(merchantId: string): Promise<DomainConfig | null> {
    const record = await prisma.domainConfig.findUnique({
      where: { merchantId },
    });

    if (!record) {
      return null;
    }

    return this.toDomain(record);
  }

  async findByCustomDomain(customDomain: string): Promise<DomainConfig | null> {
    const record = await prisma.domainConfig.findUnique({
      where: { customDomain },
    });

    if (!record) {
      return null;
    }

    return this.toDomain(record);
  }

  async upsert(input: {
    merchantId: string;
    schoolName?: string;
    logoUrl?: string | null;
    primaryColor?: string;
    customDomain?: string | null;
    bannerUrl?: string | null;
    faviconUrl?: string | null;
    secondaryColor?: string | null;
    accentColor?: string | null;
    fontFamily?: string | null;
    theme?: string | null;
  }): Promise<DomainConfig> {
    const record = await prisma.domainConfig.upsert({
      where: { merchantId: input.merchantId },
      update: {
        schoolName: input.schoolName,
        logoUrl: input.logoUrl ?? undefined,
        primaryColor: input.primaryColor,
        customDomain: input.customDomain ?? undefined,
        bannerUrl: input.bannerUrl ?? undefined,
        faviconUrl: input.faviconUrl ?? undefined,
        secondaryColor: input.secondaryColor ?? undefined,
        accentColor: input.accentColor ?? undefined,
        fontFamily: input.fontFamily ?? undefined,
        theme: input.theme ?? undefined,
        updatedAt: new Date(),
      },
      create: {
        merchantId: input.merchantId,
        schoolName: input.schoolName || "Minha Escola",
        logoUrl: input.logoUrl ?? null,
        primaryColor: input.primaryColor || "#8B5CF6",
        customDomain: input.customDomain ?? null,
        bannerUrl: input.bannerUrl ?? null,
        faviconUrl: input.faviconUrl ?? null,
        secondaryColor: input.secondaryColor ?? null,
        accentColor: input.accentColor ?? null,
        fontFamily: input.fontFamily ?? null,
        theme: input.theme ?? "dark",
      },
    });

    return this.toDomain(record);
  }

  private toDomain(record: {
    id: string;
    merchantId: string;
    schoolName: string;
    logoUrl: string | null;
    primaryColor: string;
    customDomain: string | null;
    bannerUrl: string | null;
    faviconUrl: string | null;
    secondaryColor: string | null;
    accentColor: string | null;
    fontFamily: string | null;
    theme: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): DomainConfig {
    return {
      id: record.id,
      merchantId: record.merchantId,
      schoolName: record.schoolName,
      logoUrl: record.logoUrl ?? undefined,
      primaryColor: record.primaryColor,
      customDomain: record.customDomain ?? undefined,
      bannerUrl: record.bannerUrl ?? undefined,
      faviconUrl: record.faviconUrl ?? undefined,
      secondaryColor: record.secondaryColor ?? undefined,
      accentColor: record.accentColor ?? undefined,
      fontFamily: record.fontFamily ?? undefined,
      theme: record.theme ?? undefined,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }
}

