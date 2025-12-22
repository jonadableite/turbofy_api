/**
 * Script para recalcular saldos de Wallet baseado em pagamentos históricos
 * 
 * Uso: npx ts-node scripts/recalculate-wallets.ts
 * 
 * Este script:
 * 1. Busca todas as charges PAID
 * 2. Calcula o valor líquido (amountCents - fees)
 * 3. Cria/atualiza wallets para cada merchant
 * 4. Cria WalletTransactions para auditoria
 */

import { PrismaClient } from "@prisma/client";
import { randomUUID } from "crypto";

const prisma = new PrismaClient();

interface WalletRecalculation {
  merchantId: string;
  totalCharges: number;
  totalGrossCents: number;
  totalFeesCents: number;
  totalNetCents: number;
  walletCreated: boolean;
  walletUpdated: boolean;
}

async function recalculateWallets(): Promise<void> {
  console.log("🔄 Iniciando recálculo de wallets...\n");

  try {
    // 1. Buscar todos os merchants com charges pagas
    const paidCharges = await prisma.charge.findMany({
      where: { status: "PAID" },
      include: {
        fees: true,
      },
      orderBy: { paidAt: "asc" },
    });

    console.log(`📊 Total de charges pagas: ${paidCharges.length}\n`);

    if (paidCharges.length === 0) {
      console.log("✅ Nenhuma charge paga encontrada. Nada a fazer.");
      return;
    }

    // 2. Agrupar por merchant
    const merchantData = new Map<string, {
      chargeIds: string[];
      totalGross: number;
      totalFees: number;
      totalNet: number;
    }>();

    for (const charge of paidCharges) {
      const merchantId = charge.merchantId;
      const totalFees = charge.fees.reduce((sum, fee) => sum + fee.amountCents, 0);
      const netAmount = charge.amountCents - totalFees;

      if (!merchantData.has(merchantId)) {
        merchantData.set(merchantId, {
          chargeIds: [],
          totalGross: 0,
          totalFees: 0,
          totalNet: 0,
        });
      }

      const data = merchantData.get(merchantId)!;
      data.chargeIds.push(charge.id);
      data.totalGross += charge.amountCents;
      data.totalFees += totalFees;
      data.totalNet += netAmount;
    }

    console.log(`👥 Merchants com charges pagas: ${merchantData.size}\n`);

    // 3. Processar cada merchant
    const results: WalletRecalculation[] = [];

    for (const [merchantId, data] of merchantData) {
      console.log(`Processing merchant: ${merchantId}`);
      console.log(`  - Charges: ${data.chargeIds.length}`);
      console.log(`  - Gross: R$ ${(data.totalGross / 100).toFixed(2)}`);
      console.log(`  - Fees: R$ ${(data.totalFees / 100).toFixed(2)}`);
      console.log(`  - Net: R$ ${(data.totalNet / 100).toFixed(2)}`);

      // Verificar se já existe wallet
      const existingWallet = await prisma.wallet.findUnique({
        where: { merchantId },
      });

      // Verificar quais charges já foram processadas
      const existingTransactions = await prisma.walletTransaction.findMany({
        where: {
          referenceId: { in: data.chargeIds },
          type: "CREDIT",
        },
        select: { referenceId: true },
      });

      const processedChargeIds = new Set(existingTransactions.map(t => t.referenceId));
      const chargesNeedingProcessing = data.chargeIds.filter(id => !processedChargeIds.has(id));

      console.log(`  - Already processed: ${processedChargeIds.size}`);
      console.log(`  - Need processing: ${chargesNeedingProcessing.length}`);

      if (chargesNeedingProcessing.length === 0) {
        console.log(`  ✅ All charges already processed\n`);
        results.push({
          merchantId,
          totalCharges: data.chargeIds.length,
          totalGrossCents: data.totalGross,
          totalFeesCents: data.totalFees,
          totalNetCents: data.totalNet,
          walletCreated: false,
          walletUpdated: false,
        });
        continue;
      }

      // Calcular valor líquido das charges pendentes
      let netToAdd = 0;
      const chargesToProcess = await prisma.charge.findMany({
        where: { id: { in: chargesNeedingProcessing } },
        include: { fees: true },
      });

      for (const charge of chargesToProcess) {
        const chargeFees = charge.fees.reduce((sum, fee) => sum + fee.amountCents, 0);
        netToAdd += charge.amountCents - chargeFees;
      }

      // Transação para criar/atualizar wallet e transactions
      await prisma.$transaction(async (tx) => {
        // Upsert wallet
        const wallet = await tx.wallet.upsert({
          where: { merchantId },
          create: {
            merchantId,
            availableBalanceCents: netToAdd,
            pendingBalanceCents: 0,
            totalEarnedCents: netToAdd,
          },
          update: {
            availableBalanceCents: { increment: netToAdd },
            totalEarnedCents: { increment: netToAdd },
          },
        });

        // Criar transactions para cada charge
        for (const charge of chargesToProcess) {
          const chargeFees = charge.fees.reduce((sum, fee) => sum + fee.amountCents, 0);
          const chargeNet = charge.amountCents - chargeFees;

          await tx.walletTransaction.create({
            data: {
              id: randomUUID(),
              walletId: wallet.id,
              type: "CREDIT",
              status: "COMPLETED",
              amountCents: chargeNet,
              description: `Pagamento recebido - Charge ${charge.id} (recalculated)`,
              referenceId: charge.id,
              processedAt: charge.paidAt || new Date(),
              metadata: {
                chargeId: charge.id,
                amountCents: charge.amountCents,
                totalFees: chargeFees,
                netAmountCents: chargeNet,
                recalculated: true,
                recalculatedAt: new Date().toISOString(),
              },
            },
          });
        }
      });

      console.log(`  ✅ Wallet ${existingWallet ? 'updated' : 'created'} with R$ ${(netToAdd / 100).toFixed(2)}\n`);

      results.push({
        merchantId,
        totalCharges: data.chargeIds.length,
        totalGrossCents: data.totalGross,
        totalFeesCents: data.totalFees,
        totalNetCents: data.totalNet,
        walletCreated: !existingWallet,
        walletUpdated: !!existingWallet,
      });
    }

    // 4. Resumo final
    console.log("\n" + "=".repeat(60));
    console.log("📋 RESUMO DO RECÁLCULO");
    console.log("=".repeat(60));

    const totalMerchants = results.length;
    const totalCharges = results.reduce((sum, r) => sum + r.totalCharges, 0);
    const totalGross = results.reduce((sum, r) => sum + r.totalGrossCents, 0);
    const totalFees = results.reduce((sum, r) => sum + r.totalFeesCents, 0);
    const totalNet = results.reduce((sum, r) => sum + r.totalNetCents, 0);
    const walletsCreated = results.filter(r => r.walletCreated).length;
    const walletsUpdated = results.filter(r => r.walletUpdated).length;

    console.log(`\n📊 Estatísticas:`);
    console.log(`   - Merchants processados: ${totalMerchants}`);
    console.log(`   - Charges processadas: ${totalCharges}`);
    console.log(`   - Total bruto: R$ ${(totalGross / 100).toFixed(2)}`);
    console.log(`   - Total taxas: R$ ${(totalFees / 100).toFixed(2)}`);
    console.log(`   - Total líquido: R$ ${(totalNet / 100).toFixed(2)}`);
    console.log(`   - Wallets criadas: ${walletsCreated}`);
    console.log(`   - Wallets atualizadas: ${walletsUpdated}`);

    console.log("\n✅ Recálculo concluído com sucesso!");

  } catch (error) {
    console.error("❌ Erro durante o recálculo:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Executar
recalculateWallets()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
