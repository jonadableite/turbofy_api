/**
 * Script de Validação Manual: Fluxo Rifeiro End-to-End
 * 
 * Este script valida manualmente o fluxo completo:
 * 1. Criar Rifeiro e gerar credenciais
 * 2. Criar Producer e associar Rifeiro com porcentagem
 * 3. Criar cobrança PIX via API do Rifeiro
 * 4. Verificar splits e taxas calculados corretamente
 * 5. Simular webhook de pagamento
 * 
 * Uso: pnpm ts-node scripts/test-rifeiro-flow.ts
 */

import { prisma } from "../src/infrastructure/database/prismaClient";
import { CreateCharge } from "../src/application/useCases/CreateCharge";
import { PrismaChargeRepository } from "../src/infrastructure/database/PrismaChargeRepository";
import { PaymentProviderFactory } from "../src/infrastructure/adapters/payment/PaymentProviderFactory";
import { MessagingFactory } from "../src/infrastructure/adapters/messaging/MessagingFactory";
import { PrismaPaymentInteractionRepository } from "../src/infrastructure/database/repositories/PrismaPaymentInteractionRepository";
import { LinkAssociate } from "../src/application/useCases/LinkAssociate";
import { ChargeMethod, ChargeStatus } from "../src/domain/entities/Charge";
import { randomUUID } from "crypto";
import { encryptSecret } from "../src/infrastructure/security/crypto";

const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
};

const log = {
  success: (msg: string) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  error: (msg: string) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
  info: (msg: string) => console.log(`${colors.blue}ℹ${colors.reset} ${msg}`),
  step: (msg: string) => console.log(`\n${colors.cyan}→${colors.reset} ${msg}`),
};

async function main() {
  console.log("\n" + "=".repeat(60));
  console.log("  TESTE MANUAL: Fluxo Rifeiro End-to-End");
  console.log("=".repeat(60) + "\n");

  let rifeiroUserId: string;
  let rifeiroMerchantId: string;
  let producerUserId: string;
  let producerMerchantId: string;
  let rifeiroDocument: string;
  let producerDocument: string;
  let clientId: string;
  let clientSecret: string;

  try {
    // ==========================================
    // PASSO 1: Criar Rifeiro
    // ==========================================
    log.step("PASSO 1: Criando Rifeiro...");

    rifeiroDocument = `1234567890${Math.floor(Math.random() * 1000)}`;
    const timestamp = Date.now();

    rifeiroUserId = randomUUID();
    rifeiroMerchantId = randomUUID();

    await prisma.user.create({
      data: {
        id: rifeiroUserId,
        email: `rifeiro-${timestamp}@test-manual.com`,
        document: rifeiroDocument,
        passwordHash: "hashed",
        roles: ["USER"],
      },
    });

    await prisma.merchant.create({
      data: {
        id: rifeiroMerchantId,
        name: `Rifeiro Test ${timestamp}`,
        email: `rifeiro-merchant-${timestamp}@test-manual.com`,
        document: rifeiroDocument,
        type: "RIFEIRO",
        active: true,
      },
    });

    await prisma.user.update({
      where: { id: rifeiroUserId },
      data: { merchantId: rifeiroMerchantId },
    });

    log.success(`Rifeiro criado: ${rifeiroMerchantId}`);
    log.info(`Documento: ${rifeiroDocument}`);

    // ==========================================
    // PASSO 2: Gerar Credenciais
    // ==========================================
    log.step("PASSO 2: Gerando credenciais para Rifeiro...");

    clientId = `rf_${randomUUID()}`;
    clientSecret = randomUUID();

    await prisma.providerCredentials.create({
      data: {
        merchantId: rifeiroMerchantId,
        provider: "RIFEIRO_PIX",
        clientId,
        clientSecret: encryptSecret(clientSecret),
      },
    });

    log.success("Credenciais geradas:");
    log.info(`Client ID: ${clientId}`);
    log.info(`Client Secret: ${clientSecret}`);

    // ==========================================
    // PASSO 3: Criar Producer
    // ==========================================
    log.step("PASSO 3: Criando Producer...");

    producerDocument = `9876543210${Math.floor(Math.random() * 1000)}`;
    producerUserId = randomUUID();
    producerMerchantId = randomUUID();

    await prisma.user.create({
      data: {
        id: producerUserId,
        email: `producer-${timestamp}@test-manual.com`,
        document: producerDocument,
        passwordHash: "hashed",
        roles: ["USER"],
      },
    });

    await prisma.merchant.create({
      data: {
        id: producerMerchantId,
        name: `Producer Test ${timestamp}`,
        email: `producer-merchant-${timestamp}@test-manual.com`,
        document: producerDocument,
        type: "PRODUCER",
        active: true,
      },
    });

    await prisma.user.update({
      where: { id: producerUserId },
      data: { merchantId: producerMerchantId },
    });

    log.success(`Producer criado: ${producerMerchantId}`);
    log.info(`Documento: ${producerDocument}`);

    // ==========================================
    // PASSO 4: Associar Rifeiro ao Producer
    // ==========================================
    log.step("PASSO 4: Associando Rifeiro ao Producer (10% de comissão)...");

    const linkAssociate = new LinkAssociate();
    const linkResult = await linkAssociate.execute({
      merchantId: producerMerchantId,
      document: rifeiroDocument,
      name: "Rifeiro Associado",
      email: `rifeiro-assoc-${timestamp}@test-manual.com`,
      splitPercentage: 10,
      locked: true,
    });

    log.success("Rifeiro associado ao Producer:");
    log.info(`Affiliate ID: ${linkResult.affiliate.id}`);
    log.info(`Comissão: ${linkResult.affiliate.commissionRate}%`);
    
    // Verificar se está bloqueado
    const affiliateRecord = await prisma.affiliate.findUnique({
      where: { id: linkResult.affiliate.id },
      select: { locked: true },
    });
    log.info(`Bloqueado: ${affiliateRecord?.locked ? "Sim" : "Não"}`);

    // ==========================================
    // PASSO 5: Criar Cobrança PIX
    // ==========================================
    log.step("PASSO 5: Criando cobrança PIX via CreateCharge...");

    const chargeRepository = new PrismaChargeRepository();
    const paymentProvider = PaymentProviderFactory.create();
    const messaging = MessagingFactory.create();
    const paymentInteractionRepository = new PrismaPaymentInteractionRepository();

    const createCharge = new CreateCharge(
      chargeRepository,
      paymentProvider,
      messaging,
      paymentInteractionRepository
    );

    const amountCents = 10000; // R$100,00
    const idempotencyKey = `manual-test-${randomUUID()}`;

    const chargeResult = await createCharge.execute({
      idempotencyKey,
      merchantId: rifeiroMerchantId,
      amountCents,
      currency: "BRL",
      description: "Teste manual de integração Rifeiro",
      method: ChargeMethod.PIX,
    });

    log.success(`Cobrança criada: ${chargeResult.charge.id}`);
    log.info(`Valor: R$ ${(amountCents / 100).toFixed(2)}`);
    log.info(`Status: ${chargeResult.charge.status}`);

    // ==========================================
    // PASSO 6: Verificar Splits e Taxas
    // ==========================================
    log.step("PASSO 6: Verificando splits e taxas calculados...");

    if (!chargeResult.splits || chargeResult.splits.length === 0) {
      log.error("Nenhum split foi calculado!");
      throw new Error("Splits não foram calculados");
    }

    const split = chargeResult.splits[0];
    log.success("Split calculado:");
    log.info(`  Merchant ID: ${split.merchantId}`);
    log.info(`  Porcentagem: ${split.percentage}%`);
    log.info(`  Valor: R$ ${(split.amountCents! / 100).toFixed(2)}`);

    // Validação: 10% de R$100 = R$10,00 - R$0,03 = R$9,97
    const expectedSplitAmount = 997;
    if (split.amountCents !== expectedSplitAmount) {
      log.error(
        `Valor do split incorreto! Esperado: R$ ${(expectedSplitAmount / 100).toFixed(2)}, Recebido: R$ ${(split.amountCents! / 100).toFixed(2)}`
      );
      throw new Error("Valor do split incorreto");
    }
    log.success(`Valor do split correto: R$ ${(split.amountCents! / 100).toFixed(2)}`);

    if (!chargeResult.fees || chargeResult.fees.length === 0) {
      log.error("Nenhuma taxa foi calculada!");
      throw new Error("Taxas não foram calculadas");
    }

    const fee = chargeResult.fees[0];
    log.success("Taxa calculada:");
    log.info(`  Tipo: ${fee.type}`);
    log.info(`  Valor: R$ ${(fee.amountCents / 100).toFixed(2)}`);

    // Validação: 1% de R$100 + R$0,03 = R$1,03
    const expectedFeeAmount = 103;
    if (fee.amountCents !== expectedFeeAmount) {
      log.error(
        `Valor da taxa incorreto! Esperado: R$ ${(expectedFeeAmount / 100).toFixed(2)}, Recebido: R$ ${(fee.amountCents / 100).toFixed(2)}`
      );
      throw new Error("Valor da taxa incorreto");
    }
    log.success(`Valor da taxa correto: R$ ${(fee.amountCents / 100).toFixed(2)}`);

    // ==========================================
    // PASSO 7: Verificar Persistência
    // ==========================================
    log.step("PASSO 7: Verificando persistência no banco de dados...");

    const persistedCharge = await prisma.charge.findUnique({
      where: { id: chargeResult.charge.id },
      include: {
        splits: true,
        fees: true,
      },
    });

    if (!persistedCharge) {
      log.error("Cobrança não encontrada no banco!");
      throw new Error("Cobrança não persistida");
    }

    log.success("Cobrança persistida no banco:");
    log.info(`  Splits: ${persistedCharge.splits.length}`);
    log.info(`  Taxas: ${persistedCharge.fees.length}`);

    // ==========================================
    // PASSO 8: Simular Webhook de Pagamento
    // ==========================================
    log.step("PASSO 8: Simulando webhook de pagamento...");

    const charge = await chargeRepository.findById(chargeResult.charge.id);
    if (!charge) {
      throw new Error("Charge not found");
    }

    charge.markAsPaid();
    await chargeRepository.update(charge);

    const paidCharge = await prisma.charge.findUnique({
      where: { id: charge.id },
      include: {
        splits: true,
        fees: true,
      },
    });

    if (!paidCharge) {
      log.error("Cobrança não encontrada após pagamento!");
      throw new Error("Cobrança não encontrada");
    }

    log.success("Cobrança marcada como paga:");
    log.info(`  Status: ${paidCharge.status}`);
    log.info(`  Splits preservados: ${paidCharge.splits.length}`);
    log.info(`  Taxas preservadas: ${paidCharge.fees.length}`);

    if (paidCharge.status !== "PAID") {
      log.error("Status da cobrança incorreto após pagamento!");
      throw new Error("Status incorreto");
    }

    if (paidCharge.splits.length !== 1) {
      log.error("Splits não foram preservados após pagamento!");
      throw new Error("Splits não preservados");
    }

    if (paidCharge.fees.length !== 1) {
      log.error("Taxas não foram preservadas após pagamento!");
      throw new Error("Taxas não preservadas");
    }

    log.success("Splits e taxas preservados corretamente após pagamento!");

    // ==========================================
    // RESUMO FINAL
    // ==========================================
    console.log("\n" + "=".repeat(60));
    console.log("  RESUMO DO TESTE");
    console.log("=".repeat(60));
    console.log(`✓ Rifeiro criado: ${rifeiroMerchantId}`);
    console.log(`✓ Producer criado: ${producerMerchantId}`);
    console.log(`✓ Rifeiro associado ao Producer (10% comissão)`);
    console.log(`✓ Cobrança PIX criada: ${chargeResult.charge.id}`);
    console.log(`✓ Split calculado: R$ ${(split.amountCents! / 100).toFixed(2)}`);
    console.log(`✓ Taxa calculada: R$ ${(fee.amountCents / 100).toFixed(2)}`);
    console.log(`✓ Webhook processado: Status PAID`);
    console.log(`✓ Splits e taxas preservados após pagamento`);
    console.log("=".repeat(60));
    console.log("\n✅ TODOS OS TESTES PASSARAM!\n");

    // Limpar dados de teste
    log.step("Limpando dados de teste...");
    await prisma.commissionRule.deleteMany({
      where: { merchantId: producerMerchantId },
    });
    await prisma.affiliate.deleteMany({
      where: { merchantId: producerMerchantId },
    });
    await prisma.chargeSplit.deleteMany({
      where: { chargeId: chargeResult.charge.id },
    });
    await prisma.fee.deleteMany({
      where: { chargeId: chargeResult.charge.id },
    });
    await prisma.charge.delete({ where: { id: chargeResult.charge.id } });
    await prisma.providerCredentials.deleteMany({
      where: { merchantId: rifeiroMerchantId },
    });
    await prisma.merchant.deleteMany({
      where: { id: { in: [rifeiroMerchantId, producerMerchantId] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [rifeiroUserId, producerUserId] } },
    });
    log.success("Dados de teste limpos!");

    process.exit(0);
  } catch (error) {
    log.error(`Erro durante o teste: ${error instanceof Error ? error.message : String(error)}`);
    console.error(error);

    // Tentar limpar dados em caso de erro
    try {
      if (typeof rifeiroMerchantId !== "undefined") {
        if (typeof producerMerchantId !== "undefined") {
          await prisma.commissionRule.deleteMany({
            where: { merchantId: producerMerchantId },
          });
          await prisma.affiliate.deleteMany({
            where: { merchantId: producerMerchantId },
          });
        }
        await prisma.chargeSplit.deleteMany({
          where: { charge: { merchantId: rifeiroMerchantId } },
        });
        await prisma.fee.deleteMany({
          where: { charge: { merchantId: rifeiroMerchantId } },
        });
        await prisma.charge.deleteMany({
          where: { merchantId: rifeiroMerchantId },
        });
        await prisma.providerCredentials.deleteMany({
          where: { merchantId: rifeiroMerchantId },
        });
        const merchantIds = [rifeiroMerchantId];
        if (typeof producerMerchantId !== "undefined") {
          merchantIds.push(producerMerchantId);
        }
        await prisma.merchant.deleteMany({
          where: { id: { in: merchantIds } },
        });
        const userIds: string[] = [];
        if (typeof rifeiroUserId !== "undefined") {
          userIds.push(rifeiroUserId);
        }
        if (typeof producerUserId !== "undefined") {
          userIds.push(producerUserId);
        }
        if (userIds.length > 0) {
          await prisma.user.deleteMany({
            where: { id: { in: userIds } },
          });
        }
      }
    } catch (cleanupError) {
      console.error("Erro ao limpar dados:", cleanupError);
    }

    process.exit(1);
  }
}

main();

