import { prisma } from "../prismaClient";
import { CheckoutConfigRepository, CheckoutConfigRecord, CheckoutThemeTokens } from "../../../ports/repositories/CheckoutConfigRepository";

export class PrismaCheckoutConfigRepository implements CheckoutConfigRepository {
  async findByMerchantId(merchantId: string): Promise<CheckoutConfigRecord | null> {
    const row = await prisma.checkoutConfig.findUnique({ where: { merchantId } });
    if (!row) return null;
    return {
      id: row.id,
      merchantId: row.merchantId,
      logoUrl: row.logoUrl ?? null,
      themeTokens: (row.themeTokens as CheckoutThemeTokens | null) ?? null,
      animations: row.animations,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async upsert(input: {
    merchantId: string;
    logoUrl?: string | null;
    themeTokens?: CheckoutThemeTokens | null;
    animations?: boolean;
  }): Promise<CheckoutConfigRecord> {
    const row = await prisma.checkoutConfig.upsert({
      where: { merchantId: input.merchantId },
      update: {
        logoUrl: input.logoUrl ?? undefined,
        themeTokens: input.themeTokens ? (input.themeTokens as unknown as object) : undefined,
        animations: typeof input.animations === "boolean" ? input.animations : undefined,
      },
      create: {
        merchantId: input.merchantId,
        logoUrl: input.logoUrl ?? null,
        themeTokens: input.themeTokens ? (input.themeTokens as unknown as object) : undefined,
        animations: typeof input.animations === "boolean" ? input.animations : true,
      },
    });

    return {
      id: row.id,
      merchantId: row.merchantId,
      logoUrl: row.logoUrl ?? null,
      themeTokens: (row.themeTokens as CheckoutThemeTokens | null) ?? null,
      animations: row.animations,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
