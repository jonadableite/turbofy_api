export interface CheckoutThemeTokens {
  primary?: string;
  background?: string;
  surface?: string;
  text?: string;
  success?: string;
  warning?: string;
  danger?: string;
  radius?: number;
  fontFamily?: string;
}

export interface CheckoutConfigRecord {
  id: string;
  merchantId: string;
  logoUrl?: string | null;
  themeTokens?: CheckoutThemeTokens | null;
  animations: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CheckoutConfigRepository {
  findByMerchantId(merchantId: string): Promise<CheckoutConfigRecord | null>;
  upsert(input: {
    merchantId: string;
    logoUrl?: string | null;
    themeTokens?: CheckoutThemeTokens | null;
    animations?: boolean;
  }): Promise<CheckoutConfigRecord>;
}
