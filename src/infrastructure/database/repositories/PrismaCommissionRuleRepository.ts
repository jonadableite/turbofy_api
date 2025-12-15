import { CommissionRuleRepository } from "../../../ports/repositories/CommissionRuleRepository";
import { CommissionRule } from "../../../domain/commissions/CommissionRule";
import { prisma } from "../prismaClient";

export class PrismaCommissionRuleRepository implements CommissionRuleRepository {
  async createRule(input: Omit<CommissionRule, "id" | "createdAt" | "updatedAt">): Promise<CommissionRule> {
    const record = await prisma.commissionRule.create({
      data: {
        merchantId: input.merchantId,
        affiliateId: input.affiliateId,
        productId: input.productId,
        type: input.type,
        value: input.value,
        minAmountCents: input.minAmountCents,
        maxAmountCents: input.maxAmountCents,
        priority: input.priority,
        active: input.active,
      },
    });

    return this.toDomain(record);
  }

  async listRules(merchantId: string, productId?: string): Promise<CommissionRule[]> {
    const records = await prisma.commissionRule.findMany({
      where: {
        merchantId,
        ...(productId !== undefined && { productId: productId || null }),
        active: true,
      },
      orderBy: { priority: "desc" },
    });

    return records.map((r) => this.toDomain(r));
  }

  async findById(id: string): Promise<CommissionRule | null> {
    const record = await prisma.commissionRule.findUnique({
      where: { id },
    });

    if (!record) {
      return null;
    }

    return this.toDomain(record);
  }

  async update(rule: CommissionRule): Promise<CommissionRule> {
    const record = await prisma.commissionRule.update({
      where: { id: rule.id },
      data: {
        affiliateId: rule.affiliateId,
        productId: rule.productId,
        type: rule.type,
        value: rule.value,
        minAmountCents: rule.minAmountCents,
        maxAmountCents: rule.maxAmountCents,
        priority: rule.priority,
        active: rule.active,
        updatedAt: new Date(),
      },
    });

    return this.toDomain(record);
  }

  private toDomain(record: {
    id: string;
    merchantId: string;
    affiliateId: string | null;
    productId: string | null;
    type: string;
    value: any; // Decimal from Prisma
    minAmountCents: number | null;
    maxAmountCents: number | null;
    priority: number;
    active: boolean;
    createdAt: Date;
    updatedAt: Date;
  }): CommissionRule {
    return {
      id: record.id,
      merchantId: record.merchantId,
      affiliateId: record.affiliateId ?? undefined,
      productId: record.productId ?? undefined,
      type: record.type as "PERCENTAGE" | "FIXED",
      value: Number(record.value),
      minAmountCents: record.minAmountCents ?? undefined,
      maxAmountCents: record.maxAmountCents ?? undefined,
      priority: record.priority,
      active: record.active,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }
}

