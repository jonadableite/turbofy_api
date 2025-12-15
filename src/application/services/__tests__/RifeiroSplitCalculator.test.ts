/**
 * Tests for RifeiroSplitCalculator
 * 
 * Valida cálculo automático de splits e taxas para Rifeiros
 */

import { RifeiroSplitCalculator } from "../RifeiroSplitCalculator";
import { prisma } from "../../../infrastructure/database/prismaClient";
import { randomUUID } from "crypto";

// Mock do Prisma
jest.mock("../../../infrastructure/database/prismaClient", () => ({
  prisma: {
    merchant: {
      findUnique: jest.fn(),
    },
    affiliate: {
      findMany: jest.fn(),
    },
  },
}));

describe("RifeiroSplitCalculator", () => {
  const calculator = new RifeiroSplitCalculator();
  const chargeId = randomUUID();
  const rifeiroMerchantId = randomUUID();
  const producerMerchantId = randomUUID();
  const rifeiroDocument = "12345678901";

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("calculate", () => {
    it("deve retornar splits vazios e taxa de 1% quando não há associados", async () => {
      (prisma.merchant.findUnique as jest.Mock).mockResolvedValue({
        document: rifeiroDocument,
        type: "RIFEIRO",
      });

      (prisma.affiliate.findMany as jest.Mock).mockResolvedValue([]);

      const result = await calculator.calculate({
        rifeiroMerchantId,
        chargeId,
        amountCents: 10000, // R$100,00
      });

      expect(result.splits).toHaveLength(0);
      expect(result.fees).toHaveLength(1);
      expect(result.fees[0].type).toBe("TURBOFY_SERVICE_FEE");
      // Taxa: 1% de R$100 = R$1,00 = 100 centavos
      expect(result.fees[0].amountCents).toBe(100);
      expect(result.totalFeeAmount).toBe(100);
      expect(result.totalSplitAmount).toBe(0);
    });

    it("deve calcular split para Producer com desconto de R$0,03", async () => {
      (prisma.merchant.findUnique as jest.Mock).mockResolvedValue({
        document: rifeiroDocument,
        type: "RIFEIRO",
      });

      (prisma.affiliate.findMany as jest.Mock).mockResolvedValue([
        {
          document: rifeiroDocument,
          active: true,
          merchantId: producerMerchantId,
          commissionRate: 10, // 10%
          merchant: {
            id: producerMerchantId,
            type: "PRODUCER",
          },
          commissionRules: [
            {
              productId: null,
              active: true,
              value: 10, // 10%
              priority: 100,
            },
          ],
        },
      ]);

      const result = await calculator.calculate({
        rifeiroMerchantId,
        chargeId,
        amountCents: 10000, // R$100,00
      });

      expect(result.splits).toHaveLength(1);
      expect(result.splits[0].merchantId).toBe(producerMerchantId);
      expect(result.splits[0].percentage).toBe(10);

      // Split: 10% de R$100 = R$10,00 = 1000 centavos
      // Descontando R$0,03 = 3 centavos
      // Resultado: 1000 - 3 = 997 centavos
      expect(result.splits[0].amountCents).toBe(997);
      expect(result.totalSplitAmount).toBe(997);

      // Taxa: 1% de R$100 + R$0,03 por split = 100 + 3 = 103 centavos
      expect(result.fees).toHaveLength(1);
      expect(result.fees[0].amountCents).toBe(103);
      expect(result.totalFeeAmount).toBe(103);
    });

    it("deve calcular múltiplos splits para diferentes Producers", async () => {
      const producer2MerchantId = randomUUID();

      (prisma.merchant.findUnique as jest.Mock).mockResolvedValue({
        document: rifeiroDocument,
        type: "RIFEIRO",
      });

      (prisma.affiliate.findMany as jest.Mock).mockResolvedValue([
        {
          document: rifeiroDocument,
          active: true,
          merchantId: producerMerchantId,
          commissionRate: 10, // 10%
          merchant: {
            id: producerMerchantId,
            type: "PRODUCER",
          },
          commissionRules: [
            {
              productId: null,
              active: true,
              value: 10,
              priority: 100,
            },
          ],
        },
        {
          document: rifeiroDocument,
          active: true,
          merchantId: producer2MerchantId,
          commissionRate: 5, // 5%
          merchant: {
            id: producer2MerchantId,
            type: "PRODUCER",
          },
          commissionRules: [
            {
              productId: null,
              active: true,
              value: 5,
              priority: 100,
            },
          ],
        },
      ]);

      const result = await calculator.calculate({
        rifeiroMerchantId,
        chargeId,
        amountCents: 10000, // R$100,00
      });

      expect(result.splits).toHaveLength(2);

      // Producer 1: 10% de R$100 = R$10,00 - R$0,03 = R$9,97 = 997 centavos
      const split1 = result.splits.find((s) => s.merchantId === producerMerchantId);
      expect(split1?.amountCents).toBe(997);
      expect(split1?.percentage).toBe(10);

      // Producer 2: 5% de R$100 = R$5,00 - R$0,03 = R$4,97 = 497 centavos
      const split2 = result.splits.find((s) => s.merchantId === producer2MerchantId);
      expect(split2?.amountCents).toBe(497);
      expect(split2?.percentage).toBe(5);

      expect(result.totalSplitAmount).toBe(997 + 497); // 1494 centavos

      // Taxa: 1% de R$100 + (R$0,03 * 2 splits) = 100 + 6 = 106 centavos
      expect(result.fees[0].amountCents).toBe(106);
      expect(result.totalFeeAmount).toBe(106);
    });

    it("deve retornar splits vazios se o merchant não é RIFEIRO", async () => {
      (prisma.merchant.findUnique as jest.Mock).mockResolvedValue({
        document: rifeiroDocument,
        type: "PRODUCER",
      });

      const result = await calculator.calculate({
        rifeiroMerchantId,
        chargeId,
        amountCents: 10000,
      });

      expect(result.splits).toHaveLength(0);
      expect(result.fees).toHaveLength(0);
    });

    it("deve retornar splits vazios se o Rifeiro não tem documento", async () => {
      (prisma.merchant.findUnique as jest.Mock).mockResolvedValue({
        document: null,
        type: "RIFEIRO",
      });

      const result = await calculator.calculate({
        rifeiroMerchantId,
        chargeId,
        amountCents: 10000,
      });

      expect(result.splits).toHaveLength(0);
      expect(result.fees).toHaveLength(0);
    });

    it("deve ignorar splits com porcentagem inválida", async () => {
      (prisma.merchant.findUnique as jest.Mock).mockResolvedValue({
        document: rifeiroDocument,
        type: "RIFEIRO",
      });

      (prisma.affiliate.findMany as jest.Mock).mockResolvedValue([
        {
          document: rifeiroDocument,
          active: true,
          merchantId: producerMerchantId,
          commissionRate: 0, // Porcentagem inválida
          merchant: {
            id: producerMerchantId,
            type: "PRODUCER",
          },
          commissionRules: [
            {
              productId: null,
              active: true,
              value: 0,
              priority: 100,
            },
          ],
        },
      ]);

      const result = await calculator.calculate({
        rifeiroMerchantId,
        chargeId,
        amountCents: 10000,
      });

      expect(result.splits).toHaveLength(0);
    });
  });
});


