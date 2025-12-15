/**
 * RifeiroSplitCalculator Service
 * 
 * Calcula splits e taxas automaticamente para cobranças de Rifeiros
 * 
 * Regras:
 * - Taxa Turbofy: 1% sobre o total + R$0,03 por split
 * - Split do Producer: porcentagem configurada - R$0,03 (descontado da comissão)
 * - Rifeiro recebe: valor total - splits - taxas
 */

import { prisma } from "../../infrastructure/database/prismaClient";
import { FeeCalculator, MerchantType } from "../../domain/services/FeeCalculator";
import { ChargeSplit } from "../../domain/entities/ChargeSplit";
import { Fee } from "../../domain/entities/Fee";

const RIFEIRO_PER_SPLIT_FEE_CENTS = 3; // R$0,03 por split descontado da comissão do Producer

export interface CalculateRifeiroSplitsInput {
  rifeiroMerchantId: string;
  chargeId: string;
  amountCents: number;
}

export interface CalculateRifeiroSplitsOutput {
  splits: ChargeSplit[];
  fees: Fee[];
  totalSplitAmount: number;
  totalFeeAmount: number;
}

export class RifeiroSplitCalculator {
  /**
   * Calcula splits e taxas automaticamente para uma cobrança de Rifeiro
   * Busca todos os Producers que têm este Rifeiro como associado
   */
  async calculate(input: CalculateRifeiroSplitsInput): Promise<CalculateRifeiroSplitsOutput> {
    const { rifeiroMerchantId, chargeId, amountCents } = input;

    // Buscar o Rifeiro para obter o documento
    const rifeiro = await prisma.merchant.findUnique({
      where: { id: rifeiroMerchantId },
      select: { document: true, type: true },
    });

    if (!rifeiro || rifeiro.type !== "RIFEIRO") {
      return { splits: [], fees: [], totalSplitAmount: 0, totalFeeAmount: 0 };
    }

    if (!rifeiro.document) {
      return { splits: [], fees: [], totalSplitAmount: 0, totalFeeAmount: 0 };
    }

    // Buscar todos os Affiliates (Producers) que têm este Rifeiro associado
    const affiliates = await prisma.affiliate.findMany({
      where: {
        document: rifeiro.document,
        active: true,
      },
      include: {
        merchant: {
          select: {
            id: true,
            type: true,
          },
        },
        commissionRules: {
          where: {
            productId: null, // Regra global (não específica de produto)
            active: true,
          },
          orderBy: {
            priority: "desc",
          },
          take: 1,
        },
      },
    });

    // Filtrar apenas Producers
    const producerAffiliates = affiliates.filter(
      (aff) => aff.merchant.type === "PRODUCER"
    );

    if (producerAffiliates.length === 0) {
      // Sem splits, apenas taxa do Turbofy (1% sobre o total)
      const feeAmount = FeeCalculator.calculateFee({
        amountCents,
        merchantType: MerchantType.RIFEIRO,
        splitsCount: 0,
      });

      const fee = new Fee({
        chargeId,
        type: "TURBOFY_SERVICE_FEE",
        amountCents: feeAmount,
      });

      return {
        splits: [],
        fees: [fee],
        totalSplitAmount: 0,
        totalFeeAmount: feeAmount,
      };
    }

    // Calcular splits para cada Producer
    const splits: ChargeSplit[] = [];
    let totalSplitAmount = 0;

    for (const affiliate of producerAffiliates) {
      const commissionRule = affiliate.commissionRules[0];
      const splitPercentage = commissionRule
        ? Number(commissionRule.value)
        : Number(affiliate.commissionRate);

      if (splitPercentage <= 0 || splitPercentage > 100) {
        continue;
      }

      // Calcular valor do split (porcentagem do total)
      const splitAmountCents = Math.floor(
        (amountCents * splitPercentage) / 100
      );

      // Descontar R$0,03 da comissão do Producer
      const finalSplitAmountCents = Math.max(
        0,
        splitAmountCents - RIFEIRO_PER_SPLIT_FEE_CENTS
      );

      if (finalSplitAmountCents > 0) {
        const split = new ChargeSplit({
          chargeId,
          merchantId: affiliate.merchantId,
          percentage: splitPercentage,
          amountCents: finalSplitAmountCents,
        });

        splits.push(split);
        totalSplitAmount += finalSplitAmountCents;
      }
    }

    // Calcular taxas do Turbofy
    // Taxa: 1% sobre o total + R$0,03 por split (já descontado do Producer)
    const feeAmount = FeeCalculator.calculateFee({
      amountCents,
      merchantType: MerchantType.RIFEIRO,
      splitsCount: splits.length,
    });

    const fee = new Fee({
      chargeId,
      type: "TURBOFY_SERVICE_FEE",
      amountCents: feeAmount,
    });

    return {
      splits,
      fees: [fee],
      totalSplitAmount,
      totalFeeAmount: feeAmount,
    };
  }
}


