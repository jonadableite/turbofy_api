import { DomainConfigRepository } from "../../ports/repositories/DomainConfigRepository";
import { logger } from "../../infrastructure/logger";

interface UpsertDomainConfigInput {
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
}

interface UpsertDomainConfigOutput {
  config: {
    id: string;
    merchantId: string;
    schoolName: string;
    logoUrl?: string;
    primaryColor: string;
    customDomain?: string;
    bannerUrl?: string;
    faviconUrl?: string;
    secondaryColor?: string;
    accentColor?: string;
    fontFamily?: string;
    theme?: string;
    createdAt: Date;
    updatedAt: Date;
  };
}

export class UpsertDomainConfig {
  constructor(private readonly domainConfigRepository: DomainConfigRepository) {}

  async execute(input: UpsertDomainConfigInput): Promise<UpsertDomainConfigOutput> {
    logger.info(
      { merchantId: input.merchantId },
      "Upserting domain config"
    );

    // Validar cor primária se fornecida
    if (input.primaryColor && !/^#[0-9A-Fa-f]{6}$/.test(input.primaryColor)) {
      throw new Error("primaryColor must be a valid hex color (e.g., #8B5CF6)");
    }

    // Validar domínio customizado se fornecido
    if (input.customDomain) {
      const domainRegex = /^([a-z0-9]+(-[a-z0-9]+)*\.)+[a-z]{2,}$/i;
      if (!domainRegex.test(input.customDomain)) {
        throw new Error("customDomain must be a valid domain name");
      }
    }

    const config = await this.domainConfigRepository.upsert({
      merchantId: input.merchantId,
      schoolName: input.schoolName,
      logoUrl: input.logoUrl,
      primaryColor: input.primaryColor,
      customDomain: input.customDomain,
      bannerUrl: input.bannerUrl,
      faviconUrl: input.faviconUrl,
      secondaryColor: input.secondaryColor,
      accentColor: input.accentColor,
      fontFamily: input.fontFamily,
      theme: input.theme,
    });

    logger.info(
      { merchantId: input.merchantId, configId: config.id },
      "Domain config upserted successfully"
    );

    return {
      config: {
        id: config.id,
        merchantId: config.merchantId,
        schoolName: config.schoolName,
        logoUrl: config.logoUrl,
        primaryColor: config.primaryColor,
        customDomain: config.customDomain,
        bannerUrl: config.bannerUrl,
        faviconUrl: config.faviconUrl,
        secondaryColor: config.secondaryColor,
        accentColor: config.accentColor,
        fontFamily: config.fontFamily,
        theme: config.theme,
        createdAt: config.createdAt,
        updatedAt: config.updatedAt,
      },
    };
  }
}

