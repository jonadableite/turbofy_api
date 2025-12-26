/**
 * Integration Test: Fluxo completo Rifeiro
 * 
 * Testa o fluxo end-to-end:
 * 1. Criar Rifeiro e gerar credenciais
 * 2. Criar Producer e associar Rifeiro com porcentagem
 * 3. Criar cobrança PIX via API do Rifeiro
 * 4. Verificar splits e taxas calculados corretamente
 * 5. Simular webhook de pagamento e verificar processamento
 */

import { prisma } from "../../database/prismaClient";
import { CreateCharge } from "../../../application/useCases/CreateCharge";
import { PrismaChargeRepository } from "../../database/PrismaChargeRepository";
import { PaymentProviderFactory } from "../../adapters/payment/PaymentProviderFactory";
import { MessagingFactory } from "../../adapters/messaging/MessagingFactory";
import { PrismaPaymentInteractionRepository } from "../../database/repositories/PrismaPaymentInteractionRepository";
import { LinkAssociate } from "../../../application/useCases/LinkAssociate";
import { ProcessPixWebhook } from "../../../application/useCases/ProcessPixWebhook";
import { PrismaEnrollmentRepository } from "../../database/repositories/PrismaEnrollmentRepository";
import { ChargeMethod, ChargeStatus } from "../../../domain/entities/Charge";
import { randomUUID } from "crypto";
import { encryptSecret } from "../../security/crypto";

// Mock do PaymentProvider
jest.mock("../../adapters/payment/PaymentProviderFactory");
jest.mock("../../adapters/messaging/MessagingFactory");

describe("Rifeiro Integration - Fluxo Completo", () => {
  let rifeiroUserId: string;
  let rifeiroMerchantId: string;
  let producerUserId: string;
  let producerMerchantId: string;
  let rifeiroDocument: string;
  let producerDocument: string;
  let clientId: string;
  let clientSecret: string;

  beforeAll(async () => {
    // Limpar dados de teste anteriores (se houver)
    await prisma.paymentInteraction.deleteMany({
      where: {
        merchant: {
          email: { contains: "@test-rifeiro.com" },
        },
      },
    });
    await prisma.commissionRule.deleteMany({
      where: {
        merchant: {
          email: { contains: "@test-rifeiro.com" },
        },
      },
    });
    await prisma.affiliate.deleteMany({
      where: {
        merchant: {
          email: { contains: "@test-rifeiro.com" },
        },
      },
    });
    await prisma.chargeSplit.deleteMany({
      where: {
        charge: {
          merchant: {
            email: { contains: "@test-rifeiro.com" },
          },
        },
      },
    });
    await prisma.fee.deleteMany({
      where: {
        charge: {
          merchant: {
            email: { contains: "@test-rifeiro.com" },
          },
        },
      },
    });
    await prisma.charge.deleteMany({
      where: {
        merchant: {
          email: { contains: "@test-rifeiro.com" },
        },
      },
    });
    await prisma.providerCredentials.deleteMany({
      where: {
        merchant: {
          email: { contains: "@test-rifeiro.com" },
        },
      },
    });
    await prisma.merchant.deleteMany({
      where: {
        email: { contains: "@test-rifeiro.com" },
      },
    });
    await prisma.user.deleteMany({
      where: {
        email: { contains: "@test-rifeiro.com" },
      },
    });
  });

  beforeEach(async () => {
    // Criar dados de teste
    rifeiroDocument = `1234567890${Math.floor(Math.random() * 10)}`;
    producerDocument = `9876543210${Math.floor(Math.random() * 10)}`;
    const timestamp = Date.now();

    // Criar User e Merchant para Rifeiro
    rifeiroUserId = randomUUID();
    rifeiroMerchantId = randomUUID();

    await prisma.user.create({
      data: {
        id: rifeiroUserId,
        email: `rifeiro-${timestamp}@test-rifeiro.com`,
        document: rifeiroDocument,
        passwordHash: "hashed",
        role: "BUYER",
      },
    });

    await prisma.merchant.create({
      data: {
        id: rifeiroMerchantId,
        name: `Rifeiro Test ${timestamp}`,
        email: `rifeiro-merchant-${timestamp}@test-rifeiro.com`,
        document: rifeiroDocument,
        type: "RIFEIRO",
        active: true,
      },
    });

    await prisma.user.update({
      where: { id: rifeiroUserId },
      data: { merchantId: rifeiroMerchantId },
    });

    // Gerar credenciais para Rifeiro
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

    // Criar User e Merchant para Producer
    producerUserId = randomUUID();
    producerMerchantId = randomUUID();

    await prisma.user.create({
      data: {
        id: producerUserId,
        email: `producer-${timestamp}@test-rifeiro.com`,
        document: producerDocument,
        passwordHash: "hashed",
        role: "BUYER",
      },
    });

    await prisma.merchant.create({
      data: {
        id: producerMerchantId,
        name: `Producer Test ${timestamp}`,
        email: `producer-merchant-${timestamp}@test-rifeiro.com`,
        document: producerDocument,
        type: "PRODUCER",
        active: true,
      },
    });

    await prisma.user.update({
      where: { id: producerUserId },
      data: { merchantId: producerMerchantId },
    });
  });

  afterEach(async () => {
    // Limpar dados de teste
    await prisma.commissionRule.deleteMany({
      where: {
        merchantId: { in: [rifeiroMerchantId, producerMerchantId] },
      },
    });
    await prisma.affiliate.deleteMany({
      where: {
        merchantId: { in: [rifeiroMerchantId, producerMerchantId] },
      },
    });
    await prisma.chargeSplit.deleteMany({
      where: {
        charge: {
          merchantId: { in: [rifeiroMerchantId, producerMerchantId] },
        },
      },
    });
    await prisma.fee.deleteMany({
      where: {
        charge: {
          merchantId: { in: [rifeiroMerchantId, producerMerchantId] },
        },
      },
    });
    await prisma.paymentInteraction.deleteMany({
      where: {
        merchantId: { in: [rifeiroMerchantId, producerMerchantId] },
      },
    });
    await prisma.charge.deleteMany({
      where: {
        merchantId: { in: [rifeiroMerchantId, producerMerchantId] },
      },
    });
    await prisma.providerCredentials.deleteMany({
      where: {
        merchantId: rifeiroMerchantId,
      },
    });
    await prisma.merchant.deleteMany({
      where: {
        id: { in: [rifeiroMerchantId, producerMerchantId] },
      },
    });
    await prisma.user.deleteMany({
      where: {
        id: { in: [rifeiroUserId, producerUserId] },
      },
    });
  });

  describe("Fluxo Completo: Criar Rifeiro → Associar Producer → Criar Cobrança → Processar Webhook", () => {
    it("deve executar fluxo completo com splits e taxas corretas", async () => {
      // 1. Associar Producer ao Rifeiro com 10% de comissão
      const linkAssociate = new LinkAssociate();
      const linkResult = await linkAssociate.execute({
        merchantId: producerMerchantId,
        document: rifeiroDocument,
        name: "Rifeiro Associado",
        email: `rifeiro-assoc-${Date.now()}@test-rifeiro.com`,
        splitPercentage: 10,
        locked: true, // Bloquear após confirmação
      });

      expect(linkResult.affiliate).toBeDefined();
      expect(linkResult.commissionRule).toBeDefined();
      expect(linkResult.affiliate.commissionRate).toBe(10);

      // Verificar que affiliate está locked
      const lockedAffiliate = await prisma.affiliate.findUnique({
        where: { id: linkResult.affiliate.id },
      });
      expect(lockedAffiliate?.locked).toBe(true);

      // 2. Criar cobrança PIX via CreateCharge (simulando chamada da API do Rifeiro)
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

      const createCharge = new CreateCharge(
        chargeRepository,
        paymentProvider,
        messaging,
        paymentInteractionRepository
      );

      const amountCents = 10000; // R$100,00
      const idempotencyKey = `test-${randomUUID()}`;

      const chargeResult = await createCharge.execute({
        idempotencyKey,
        merchantId: rifeiroMerchantId,
        amountCents,
        currency: "BRL",
        description: "Teste de integração Rifeiro",
        method: ChargeMethod.PIX,
      });

      expect(chargeResult.charge).toBeDefined();
      expect(chargeResult.charge.merchantId).toBe(rifeiroMerchantId);
      expect(chargeResult.charge.amountCents).toBe(amountCents);
      expect(chargeResult.charge.status).toBe(ChargeStatus.PENDING);

      // 3. Verificar splits calculados automaticamente
      expect(chargeResult.splits).toBeDefined();
      expect(chargeResult.splits!.length).toBe(1);

      const split = chargeResult.splits![0];
      expect(split.merchantId).toBe(producerMerchantId);
      expect(split.percentage).toBe(10);

      // Split: 10% de R$100 = R$10,00 = 1000 centavos
      // Descontando R$0,03 = 3 centavos
      // Resultado: 1000 - 3 = 997 centavos
      expect(split.amountCents).toBe(997);

      // 4. Verificar taxas calculadas
      expect(chargeResult.fees).toBeDefined();
      expect(chargeResult.fees!.length).toBe(1);

      const fee = chargeResult.fees![0];
      expect(fee.type).toBe("TURBOFY_SERVICE_FEE");

      // Taxa: 1% de R$100 + R$0,03 por split = 100 + 3 = 103 centavos
      expect(fee.amountCents).toBe(103);

      // 5. Verificar persistência no banco
      const persistedCharge = await prisma.charge.findUnique({
        where: { id: chargeResult.charge.id },
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

      // 6. Simular webhook de pagamento
      const charge = await chargeRepository.findById(chargeResult.charge.id);
      if (!charge) {
        throw new Error("Charge not found");
      }

      // Marcar como paga
      charge.markAsPaid();
      await chargeRepository.update(charge);

      // Verificar que splits ainda existem após pagamento
      const paidCharge = await prisma.charge.findUnique({
        where: { id: charge.id },
        include: {
          splits: true,
          fees: true,
        },
      });

      expect(paidCharge?.status).toBe("PAID");
      expect(paidCharge?.splits.length).toBe(1);
      expect(paidCharge?.fees.length).toBe(1);
      expect(paidCharge?.splits[0].amountCents).toBe(997);
      expect(paidCharge?.fees[0].amountCents).toBe(103);

      // 7. Verificar que não é possível editar affiliate bloqueado
      await expect(
        linkAssociate.execute({
          merchantId: producerMerchantId,
          document: rifeiroDocument,
          name: "Tentativa de edição",
          email: "edit@test.com",
          splitPercentage: 15,
        })
      ).rejects.toThrow("Associado está bloqueado");
    });

    it("deve criar charge sem splits quando não há associados", async () => {
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

      const createCharge = new CreateCharge(
        chargeRepository,
        paymentProvider,
        messaging,
        paymentInteractionRepository
      );

      const amountCents = 10000; // R$100,00
      const idempotencyKey = `test-${randomUUID()}`;

      const chargeResult = await createCharge.execute({
        idempotencyKey,
        merchantId: rifeiroMerchantId,
        amountCents,
        currency: "BRL",
        description: "Teste sem associados",
        method: ChargeMethod.PIX,
      });

      expect(chargeResult.charge).toBeDefined();
      expect(chargeResult.splits).toBeUndefined(); // Sem splits

      // Apenas taxa de 1% (sem splits)
      expect(chargeResult.fees).toBeDefined();
      expect(chargeResult.fees!.length).toBe(1);
      expect(chargeResult.fees![0].amountCents).toBe(100); // 1% de R$100
    });

    it("deve calcular múltiplos splits para diferentes Producers", async () => {
      // Criar segundo Producer
      const producer2UserId = randomUUID();
      const producer2MerchantId = randomUUID();
      const producer2Document = `5555555555${Math.floor(Math.random() * 10)}`;

      await prisma.user.create({
        data: {
          id: producer2UserId,
          email: `producer2-${Date.now()}@test-rifeiro.com`,
          document: producer2Document,
          passwordHash: "hashed",
          role: "BUYER",
        },
      });

      await prisma.merchant.create({
        data: {
          id: producer2MerchantId,
          name: `Producer 2 Test ${Date.now()}`,
          email: `producer2-merchant-${Date.now()}@test-rifeiro.com`,
          document: producer2Document,
          type: "PRODUCER",
          active: true,
        },
      });

      await prisma.user.update({
        where: { id: producer2UserId },
        data: { merchantId: producer2MerchantId },
      });

      // Associar ambos os Producers ao Rifeiro
      const linkAssociate = new LinkAssociate();

      await linkAssociate.execute({
        merchantId: producerMerchantId,
        document: rifeiroDocument,
        name: "Rifeiro Associado 1",
        email: `rifeiro-assoc1-${Date.now()}@test-rifeiro.com`,
        splitPercentage: 10,
      });

      await linkAssociate.execute({
        merchantId: producer2MerchantId,
        document: rifeiroDocument,
        name: "Rifeiro Associado 2",
        email: `rifeiro-assoc2-${Date.now()}@test-rifeiro.com`,
        splitPercentage: 5,
      });

      // Criar cobrança
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

      const createCharge = new CreateCharge(
        chargeRepository,
        paymentProvider,
        messaging,
        paymentInteractionRepository
      );

      const amountCents = 10000; // R$100,00
      const idempotencyKey = `test-${randomUUID()}`;

      const chargeResult = await createCharge.execute({
        idempotencyKey,
        merchantId: rifeiroMerchantId,
        amountCents,
        currency: "BRL",
        description: "Teste múltiplos splits",
        method: ChargeMethod.PIX,
      });

      expect(chargeResult.splits).toBeDefined();
      expect(chargeResult.splits!.length).toBe(2);

      // Producer 1: 10% de R$100 = R$10,00 - R$0,03 = R$9,97 = 997 centavos
      const split1 = chargeResult.splits!.find((s) => s.merchantId === producerMerchantId);
      expect(split1?.amountCents).toBe(997);
      expect(split1?.percentage).toBe(10);

      // Producer 2: 5% de R$100 = R$5,00 - R$0,03 = R$4,97 = 497 centavos
      const split2 = chargeResult.splits!.find((s) => s.merchantId === producer2MerchantId);
      expect(split2?.amountCents).toBe(497);
      expect(split2?.percentage).toBe(5);

      // Taxa: 1% de R$100 + (R$0,03 * 2 splits) = 100 + 6 = 106 centavos
      expect(chargeResult.fees![0].amountCents).toBe(106);

      // Limpar
      await prisma.commissionRule.deleteMany({
        where: { merchantId: producer2MerchantId },
      });
      await prisma.affiliate.deleteMany({
        where: { merchantId: producer2MerchantId },
      });
      await prisma.chargeSplit.deleteMany({
        where: { merchantId: producer2MerchantId },
      });
      await prisma.fee.deleteMany({
        where: { charge: { merchantId: producer2MerchantId } },
      });
      await prisma.paymentInteraction.deleteMany({
        where: { merchantId: producer2MerchantId },
      });
      await prisma.charge.deleteMany({
        where: { merchantId: producer2MerchantId },
      });
      await prisma.merchant.delete({ where: { id: producer2MerchantId } });
      await prisma.user.delete({ where: { id: producer2UserId } });
    });
  });
});

