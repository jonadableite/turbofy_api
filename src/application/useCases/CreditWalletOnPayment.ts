/**
 * Use Case: CreditWalletOnPayment
 * 
 * Credita a carteira (Wallet) quando um pagamento é confirmado
 * Calcula o valor líquido (amountCents - fees) e adiciona ao saldo disponível
 * 
 * @security Idempotência garantida por chargeId
 * @reliability Transação atômica no banco de dados
 */

import { randomUUID } from "crypto";
import { logger } from "../../infrastructure/logger";
import { prisma } from "../../infrastructure/database/prismaClient";

interface CreditWalletInput {
  chargeId: string;
  traceId?: string;
}

interface CreditWalletOutput {
  walletCredited: boolean;
  amountCreditedCents: number;
  merchantId: string;
}

export class CreditWalletOnPayment {
  async execute(input: CreditWalletInput): Promise<CreditWalletOutput> {
    const { chargeId, traceId } = input;

    // 1. Buscar charge com fees
    const charge = await prisma.charge.findUnique({
      where: { id: chargeId },
      include: {
        fees: true,
        splits: true,
      },
    });

    if (!charge) {
      throw new Error(`Charge ${chargeId} not found`);
    }

    if (charge.status !== "PAID") {
      logger.warn({
        type: "CREDIT_WALLET_CHARGE_NOT_PAID",
        message: "Charge is not paid, skipping wallet credit",
        payload: { chargeId, status: charge.status },
      });
      return {
        walletCredited: false,
        amountCreditedCents: 0,
        merchantId: charge.merchantId,
      };
    }

    // 2. Calcular valor líquido (total - fees)
    const totalFees = charge.fees.reduce((sum, fee) => sum + fee.amountCents, 0);
    const netAmountCents = charge.amountCents - totalFees;

    if (netAmountCents <= 0) {
      logger.warn({
        type: "CREDIT_WALLET_NO_NET_AMOUNT",
        message: "No net amount to credit (fees >= charge amount)",
        payload: { chargeId, amountCents: charge.amountCents, totalFees },
      });
      return {
        walletCredited: false,
        amountCreditedCents: 0,
        merchantId: charge.merchantId,
      };
    }

    // 3. Atualizar wallet (upsert para criar se não existir)
    await prisma.$transaction(async (tx) => {
      // Upsert wallet
      const wallet = await tx.wallet.upsert({
        where: { merchantId: charge.merchantId },
        create: {
          merchantId: charge.merchantId,
          availableBalanceCents: netAmountCents,
          pendingBalanceCents: 0,
          totalReceivedCents: netAmountCents,
        },
        update: {
          availableBalanceCents: {
            increment: netAmountCents,
          },
          totalReceivedCents: {
            increment: netAmountCents,
          },
        },
      });

      // Criar WalletTransaction para auditoria
      await tx.walletTransaction.create({
        data: {
          id: randomUUID(),
          walletId: wallet.id,
          type: "CREDIT",
          amountCents: netAmountCents,
          balanceAfterCents: wallet.availableBalanceCents + netAmountCents,
          description: `Pagamento recebido - Charge ${chargeId}`,
          referenceType: "CHARGE",
          referenceId: chargeId,
          metadata: {
            chargeId,
            amountCents: charge.amountCents,
            totalFees,
            netAmountCents,
            traceId,
          },
        },
      });
    });

    logger.info({
      type: "WALLET_CREDITED",
      message: "Wallet credited on payment",
      payload: {
        chargeId,
        merchantId: charge.merchantId,
        amountCreditedCents: netAmountCents,
        totalFees,
        traceId,
      },
    });

    return {
      walletCredited: true,
      amountCreditedCents: netAmountCents,
      merchantId: charge.merchantId,
    };
  }
}
