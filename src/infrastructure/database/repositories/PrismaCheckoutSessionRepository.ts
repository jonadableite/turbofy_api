import { prisma } from "../prismaClient";
import { CheckoutSessionRepository, CheckoutSessionRecord, CheckoutSessionStatus } from "../../../ports/repositories/CheckoutSessionRepository";

export class PrismaCheckoutSessionRepository implements CheckoutSessionRepository {
  async create(input: {
    chargeId: string;
    merchantId: string;
    returnUrl?: string | null;
    cancelUrl?: string | null;
    themeSnapshot?: Record<string, unknown> | null;
    expiresAt?: Date | null;
  }): Promise<CheckoutSessionRecord> {
    const row = await prisma.checkoutSession.create({
      data: {
        chargeId: input.chargeId,
        merchantId: input.merchantId,
        returnUrl: input.returnUrl ?? null,
        cancelUrl: input.cancelUrl ?? null,
        themeSnapshot: input.themeSnapshot ? (input.themeSnapshot as unknown as object) : undefined,
        expiresAt: input.expiresAt ?? null,
      },
    });
    return this.map(row);
  }

  async findById(id: string): Promise<CheckoutSessionRecord | null> {
    const row = await prisma.checkoutSession.findUnique({ where: { id } });
    if (!row) return null;
    return this.map(row);
  }

  async updateStatus(id: string, status: CheckoutSessionStatus): Promise<CheckoutSessionRecord> {
    const row = await prisma.checkoutSession.update({ where: { id }, data: { status } });
    return this.map(row);
  }

  private map(row: any): CheckoutSessionRecord {
    return {
      id: row.id,
      chargeId: row.chargeId,
      merchantId: row.merchantId,
      status: row.status as CheckoutSessionStatus,
      returnUrl: row.returnUrl ?? null,
      cancelUrl: row.cancelUrl ?? null,
      themeSnapshot: (row.themeSnapshot as Record<string, unknown> | null) ?? null,
      expiresAt: row.expiresAt ?? null,
      createdAt: row.createdAt,
    };
  }
}
