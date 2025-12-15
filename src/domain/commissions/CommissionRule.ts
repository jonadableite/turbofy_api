export interface CommissionRule {
  id: string;
  merchantId: string;
  affiliateId?: string;
  productId?: string; // null para regra global
  type: "PERCENTAGE" | "FIXED";
  value: number; // Percentual (0-100) ou valor fixo em centavos
  minAmountCents?: number;
  maxAmountCents?: number;
  priority: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}