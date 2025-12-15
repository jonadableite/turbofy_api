export interface Affiliate {
  id: string;
  merchantId: string;
  name: string;
  email: string;
  document?: string;
  phone?: string;
  commissionRate: number; // 0-100
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface AffiliateLink {
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
}