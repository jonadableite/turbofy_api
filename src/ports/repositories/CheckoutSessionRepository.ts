export type CheckoutSessionStatus = "CREATED" | "OPENED" | "COMPLETED" | "EXPIRED";

export interface CheckoutSessionRecord {
  id: string;
  chargeId: string;
  merchantId: string;
  status: CheckoutSessionStatus;
  returnUrl?: string | null;
  cancelUrl?: string | null;
  themeSnapshot?: Record<string, unknown> | null;
  expiresAt?: Date | null;
  createdAt: Date;
}

export interface CheckoutSessionRepository {
  create(input: {
    chargeId: string;
    merchantId: string;
    returnUrl?: string | null;
    cancelUrl?: string | null;
    themeSnapshot?: Record<string, unknown> | null;
    expiresAt?: Date | null;
  }): Promise<CheckoutSessionRecord>;

  findById(id: string): Promise<CheckoutSessionRecord | null>;

  updateStatus(id: string, status: CheckoutSessionStatus): Promise<CheckoutSessionRecord>;
}
