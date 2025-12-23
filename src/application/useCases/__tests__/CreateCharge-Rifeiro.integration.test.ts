/**
 * Integration Test: CreateCharge com Rifeiro e splits automáticos
 * 
 * Valida o fluxo completo:
 * 1. Rifeiro cria cobrança PIX
 * 2. Sistema calcula splits automaticamente dos Producers associados
 * 3. Sistema calcula taxas (1% + R$0,03 por split)
 * 4. Splits e fees são persistidos corretamente
 */

import { CreateCharge } from "../CreateCharge";
import { PrismaChargeRepository } from "../../../infrastructure/database/PrismaChargeRepository";
import { TransfeeraClient } from "../../../infrastructure/adapters/payment/TransfeeraClient";
import { RabbitMQMessagingAdapter } from "../../../infrastructure/adapters/messaging/RabbitMQMessagingAdapter";
import { PrismaPaymentInteractionRepository } from "../../../infrastructure/database/repositories/PrismaPaymentInteractionRepository";
import { prisma } from "../../../infrastructure/database/prismaClient";
import { ChargeMethod } from "../../../domain/entities/Charge";
import { randomUUID } from "crypto";

// Mock do TransfeeraClient
jest.mock("../../../infrastructure/adapters/payment/TransfeeraClient");
jest.mock("../../../infrastructure/adapters/messaging/RabbitMQMessagingAdapter");

describe("CreateCharge - Rifeiro Integration", () => {
  let createCharge: CreateCharge;
  let rifeiroMerchantId: string;
  let producerMerchantId: string;
  let rifeiroUserId: string;
  let producerUserId: string;
  let rifeiroDocument: string;

  beforeAll(async () => {
    // Criar dados de teste
    rifeiroDocument = "12345678901";

    // Criar User e Merchant para Rifeiro
    rifeiroUserId = randomUUID();
    rifeiroMerchantId = randomUUID();

    await prisma.user.create({
      data: {
        id: rifeiroUserId,
        email: `rifeiro-${randomUUID()}@test.com`,
        document: rifeiroDocument,
        passwordHash: "hashed",
        roles: ["BUYER"],
      },
    });

    await prisma.merchant.create({
      data: {
        id: rifeiroMerchantId,
        name: "Rifeiro Test",
        email: `rifeiro-${randomUUID()}@test.com`,
        document: rifeiroDocument,
        type: "RIFEIRO",
        active: true,
      },
    });

    // Associar User ao Merchant
    await prisma.user.update({
      where: { id: rifeiroUserId },
      data: { merchantId: rifeiroMerchantId },
    });

    // Criar User e Merchant para Producer
    producerUserId = randomUUID();
    producerMerchantId = randomUUID();

    await prisma.user.create({
      data: {
        id: producerUserId,
        email: `producer-${randomUUID()}@test.com`,
        document: "98765432100",
        passwordHash: "hashed",
        roles: ["BUYER"],
      },
    });

    await prisma.merchant.create({
      data: {
        id: producerMerchantId,
        name: "Producer Test",
        email: `producer-${randomUUID()}@test.com`,
        document: "98765432100",
        type: "PRODUCER",
        active: true,
      },
    });

    // Associar User ao Merchant
    await prisma.user.update({
      where: { id: producerUserId },
      data: { merchantId: producerMerchantId },
    });

    // Criar Affiliate (Producer associado ao Rifeiro)
    const affiliate = await prisma.affiliate.create({
      data: {
        merchantId: producerMerchantId,
        name: "Rifeiro Associado",
        email: `rifeiro-assoc-${randomUUID()}@test.com`,
        document: rifeiroDocument,
        commissionRate: 10, // 10%
        active: true,
        locked: false,
      },
    });

    // Criar CommissionRule
    await prisma.commissionRule.create({
      data: {
        merchantId: producerMerchantId,
        affiliateId: affiliate.id,
        type: "PERCENTAGE",
        value: 10, // 10%
        priority: 100,
        active: true,
      },
    });

    // Inicializar use case
    const chargeRepository = new PrismaChargeRepository();
    const paymentProvider = {
      issuePixCharge: jest.fn().mockResolvedValue({
        qrCode: "00020126360014BR.GOV.BCB.PIX...",
        copyPaste: "00020126360014BR.GOV.BCB.PIX...",
      }),
      issueBoletoCharge: jest.fn(),
    } as any;
    const messaging = {
      publish: jest.fn().mockResolvedValue(undefined),
    } as any;
    const paymentInteractionRepository = new PrismaPaymentInteractionRepository();

    createCharge = new CreateCharge(
      chargeRepository,
      paymentProvider,
      messaging,
      paymentInteractionRepository
    );
  });

  afterAll(async () => {
    // Limpar dados de teste
    await prisma.commissionRule.deleteMany({
      where: { merchantId: producerMerchantId },
    });
    await prisma.affiliate.deleteMany({
      where: { merchantId: producerMerchantId },
    });
    await prisma.chargeSplit.deleteMany({
      where: { charge: { merchantId: rifeiroMerchantId } },
    });
    await prisma.fee.deleteMany({
      where: { charge: { merchantId: rifeiroMerchantId } },
    });
    await prisma.charge.deleteMany({
      where: { merchantId: rifeiroMerchantId },
    });
    await prisma.merchant.deleteMany({
      where: { id: { in: [rifeiroMerchantId, producerMerchantId] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [rifeiroUserId, producerUserId] } },
    });
  });

  it("deve criar charge de Rifeiro com splits automáticos e taxas corretas", async () => {
    const idempotencyKey = `test-${randomUUID()}`;
    const amountCents = 10000; // R$100,00

    const result = await createCharge.execute({
      idempotencyKey,
      merchantId: rifeiroMerchantId,
      amountCents,
      currency: "BRL",
      description: "Test charge",
      method: ChargeMethod.PIX,
    });

    expect(result.charge).toBeDefined();
    expect(result.charge.merchantId).toBe(rifeiroMerchantId);
    expect(result.charge.amountCents).toBe(amountCents);

    // Verificar splits criados
    expect(result.splits).toBeDefined();
    expect(result.splits!.length).toBeGreaterThan(0);

    const split = result.splits![0];
    expect(split.merchantId).toBe(producerMerchantId);
    expect(split.percentage).toBe(10);

    // Split: 10% de R$100 = R$10,00 = 1000 centavos
    // Descontando R$0,03 = 3 centavos
    // Resultado: 1000 - 3 = 997 centavos
    expect(split.amountCents).toBe(997);

    // Verificar fees criados
    expect(result.fees).toBeDefined();
    expect(result.fees!.length).toBeGreaterThan(0);

    const fee = result.fees![0];
    expect(fee.type).toBe("TURBOFY_SERVICE_FEE");

    // Taxa: 1% de R$100 + R$0,03 por split = 100 + 3 = 103 centavos
    expect(fee.amountCents).toBe(103);

    // Verificar persistência no banco
    const persistedCharge = await prisma.charge.findUnique({
      where: { id: result.charge.id },
      include: {
        splits: true,
        fees: true,
      },
    });

    expect(persistedCharge).toBeDefined();
    expect(persistedCharge!.splits.length).toBe(1);
    expect(persistedCharge!.fees.length).toBe(1);
    expect(persistedCharge!.splits[0].amountCents).toBe(997);
    expect(persistedCharge!.fees[0].amountCents).toBe(103);
  });

  it("deve criar charge sem splits quando não há associados", async () => {
    // Criar outro Rifeiro sem associados
    const rifeiro2UserId = randomUUID();
    const rifeiro2MerchantId = randomUUID();
    const rifeiro2Document = "11111111111";

    await prisma.user.create({
      data: {
        id: rifeiro2UserId,
        email: `rifeiro2-${randomUUID()}@test.com`,
        document: rifeiro2Document,
        passwordHash: "hashed",
        roles: ["BUYER"],
      },
    });

    await prisma.merchant.create({
      data: {
        id: rifeiro2MerchantId,
        name: "Rifeiro 2 Test",
        email: `rifeiro2-${randomUUID()}@test.com`,
        document: rifeiro2Document,
        type: "RIFEIRO",
        active: true,
      },
    });

    // Associar User ao Merchant
    await prisma.user.update({
      where: { id: rifeiro2UserId },
      data: { merchantId: rifeiro2MerchantId },
    });

    const idempotencyKey = `test-${randomUUID()}`;
    const amountCents = 10000; // R$100,00

    const result = await createCharge.execute({
      idempotencyKey,
      merchantId: rifeiro2MerchantId,
      amountCents,
      currency: "BRL",
      description: "Test charge without splits",
      method: ChargeMethod.PIX,
    });

    expect(result.charge).toBeDefined();
    expect(result.splits).toBeUndefined(); // Sem splits

    // Apenas taxa de 1% (sem splits)
    expect(result.fees).toBeDefined();
    expect(result.fees!.length).toBe(1);
    expect(result.fees![0].amountCents).toBe(100); // 1% de R$100

    // Limpar
    await prisma.charge.deleteMany({
      where: { merchantId: rifeiro2MerchantId },
    });
    await prisma.merchant.delete({ where: { id: rifeiro2MerchantId } });
    await prisma.user.delete({ where: { id: rifeiro2UserId } });
  });
});

