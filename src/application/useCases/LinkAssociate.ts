import { CommissionRule } from "../../domain/commissions/CommissionRule";
import { Affiliate } from "../../domain/affiliates/Affiliate";
import { prisma } from "../../infrastructure/database/prismaClient";

export interface LinkAssociateInput {
  merchantId: string;
  document: string;
  splitPercentage: number;
  name: string;
  email?: string;
  phone?: string;
  locked?: boolean; // Se true, marca como locked após confirmação
}

export interface LinkAssociateOutput {
  affiliate: Affiliate;
  commissionRule: CommissionRule;
  user?: {
    id: string;
    email: string;
    document: string;
    phone?: string | null;
  };
}

const normalizeDocument = (value: string): string =>
  value.replace(/\D/g, "");

export class LinkAssociate {
  async execute(input: LinkAssociateInput): Promise<LinkAssociateOutput> {
    const document = normalizeDocument(input.document);

    if (!document) {
      throw new Error("Documento obrigatório");
    }

    if (
      !Number.isFinite(input.splitPercentage) ||
      input.splitPercentage <= 0 ||
      input.splitPercentage > 100
    ) {
      throw new Error("splitPercentage deve estar entre 0 e 100");
    }

    const existingUser = await prisma.user.findUnique({
      where: { document },
      select: { id: true, email: true, document: true, phone: true },
    });

    const existingAffiliate = await prisma.affiliate.findFirst({
      where: {
        merchantId: input.merchantId,
        document,
      },
      select: {
        id: true,
        locked: true,
        email: true,
        phone: true,
      },
    });

    // Se já existe e está locked, não permite edição
    if (existingAffiliate?.locked) {
      throw new Error("Associado está bloqueado e não pode ser editado. Contate o suporte.");
    }

    const affiliateRecord = existingAffiliate
      ? await prisma.affiliate.update({
          where: { id: existingAffiliate.id },
          data: {
            name: input.name,
            email: input.email ?? existingAffiliate.email,
            phone: input.phone ?? existingAffiliate.phone,
            commissionRate: input.splitPercentage,
            active: true,
            locked: input.locked ?? false,
          },
        })
      : await prisma.affiliate.create({
          data: {
            merchantId: input.merchantId,
            name: input.name,
            email:
              input.email ??
              existingUser?.email ??
              `${document}@placeholder.turbofy`,
            document,
            phone: input.phone ?? existingUser?.phone ?? null,
            commissionRate: input.splitPercentage,
            active: true,
            locked: input.locked ?? false,
          },
        });

    const existingCommissionRule = await prisma.commissionRule.findFirst({
      where: {
        merchantId: input.merchantId,
        affiliateId: affiliateRecord.id,
        productId: null,
      },
      orderBy: { priority: "desc" },
    });

    const commissionRuleRecord = existingCommissionRule
      ? await prisma.commissionRule.update({
          where: { id: existingCommissionRule.id },
          data: {
            value: input.splitPercentage,
            active: true,
          },
        })
      : await prisma.commissionRule.create({
          data: {
            merchantId: input.merchantId,
            affiliateId: affiliateRecord.id,
            productId: null,
            type: "PERCENTAGE",
            value: input.splitPercentage,
            minAmountCents: null,
            maxAmountCents: null,
            priority: 100,
            active: true,
          },
        });

    const affiliate: Affiliate = {
      id: affiliateRecord.id,
      merchantId: affiliateRecord.merchantId,
      name: affiliateRecord.name,
      email: affiliateRecord.email,
      document: affiliateRecord.document ?? undefined,
      phone: affiliateRecord.phone ?? undefined,
      commissionRate: Number(affiliateRecord.commissionRate),
      active: affiliateRecord.active,
      createdAt: affiliateRecord.createdAt,
      updatedAt: affiliateRecord.updatedAt,
    };

    const commissionRule: CommissionRule = {
      id: commissionRuleRecord.id,
      merchantId: commissionRuleRecord.merchantId,
      affiliateId: commissionRuleRecord.affiliateId ?? undefined,
      productId: commissionRuleRecord.productId ?? undefined,
      type: commissionRuleRecord.type as "PERCENTAGE" | "FIXED",
      value: Number(commissionRuleRecord.value),
      minAmountCents: commissionRuleRecord.minAmountCents ?? undefined,
      maxAmountCents: commissionRuleRecord.maxAmountCents ?? undefined,
      priority: commissionRuleRecord.priority,
      active: commissionRuleRecord.active,
      createdAt: commissionRuleRecord.createdAt,
      updatedAt: commissionRuleRecord.updatedAt,
    };

    return {
      affiliate,
      commissionRule,
      user: existingUser ?? undefined,
    };
  }
}

