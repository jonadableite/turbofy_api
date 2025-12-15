/**
 * DomainConfigRepository
 * 
 * Interface para gerenciar configurações de domínio e branding
 */

export interface DomainConfig {
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
}

export interface DomainConfigRepository {
  findByMerchantId(merchantId: string): Promise<DomainConfig | null>;
  findByCustomDomain(customDomain: string): Promise<DomainConfig | null>;
  upsert(input: {
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
  }): Promise<DomainConfig>;
}

