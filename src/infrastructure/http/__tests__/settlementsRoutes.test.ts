import request from "supertest";
import express from "express";
import { settlementsRouter } from "../../http/routes/settlementsRoutes";
import { Settlement, SettlementStatus } from "../../../domain/entities/Settlement";

// In-memory store to simulate DB
const settlementsStore = new Map<string, Settlement>();

// Mock PrismaSettlementRepository to avoid real DB access
jest.mock("../../database/PrismaSettlementRepository", () => {
  return {
    PrismaSettlementRepository: class {
      constructor(_: any) {}
      async findById(id: string) {
        return settlementsStore.get(id) ?? null;
      }
      async findByMerchantId() { return []; }
      async findDueSettlements() { return []; }
      async create(settlement: Settlement) {
        settlementsStore.set(settlement.id, settlement);
        return settlement;
      }
      async update(settlement: Settlement) {
        settlementsStore.set(settlement.id, settlement);
        return settlement;
      }
    },
  };
});

// Allow overriding banking adapter behavior per test
let bankingShouldFail = false;
let bankingStatus: "COMPLETED" | "FAILED" | "PROCESSING" = "COMPLETED";
let bankingFailureReason = "Banking error";
let forcedTransactionId = "txn-fixed-001";

jest.mock("../../adapters/banking/StubBankingAdapter", () => {
  return {
    StubBankingAdapter: class {
      async processSettlement() {
        if (bankingShouldFail) {
          throw new Error(bankingFailureReason);
        }
        if (bankingStatus === "FAILED") {
          return { transactionId: undefined, status: "FAILED", processedAt: new Date(), failureReason: bankingFailureReason };
        }
        if (bankingStatus === "PROCESSING") {
          return { transactionId: undefined, status: "PROCESSING", processedAt: new Date() };
        }
        return { transactionId: forcedTransactionId, status: "COMPLETED", processedAt: new Date() };
      }
      async getSettlementStatus(txId: string) {
        return { transactionId: txId, status: "COMPLETED", processedAt: new Date() };
      }
    }
  };
});

// Messaging adapter can be left as-is; events are not asserted here

describe("settlementsRoutes", () => {
  const app = express();
  app.use(express.json());
  app.use("/settlements", settlementsRouter);
  const merchantId = "7f9f6f2c-3d7f-45e7-8b9d-1aa0b8b6d001";
  const bankAccountId = "c6f7d6e5-2c3b-4a7f-9e1d-0c8a7b6a5d02";

  beforeEach(() => {
    settlementsStore.clear();
    bankingShouldFail = false;
    bankingStatus = "COMPLETED";
    bankingFailureReason = "Banking error";
    forcedTransactionId = "txn-fixed-001";
  });

  describe("POST /settlements - criação", () => {
    it("cria settlement PENDING sem agendamento", async () => {
      const res = await request(app)
        .post("/settlements")
        .send({
          merchantId,
          amountCents: 25000,
          currency: "BRL",
          bankAccountId,
        });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe("PENDING");
      expect(res.body.bankAccountId).toBe(bankAccountId);
      expect(res.body.scheduledFor).toBeUndefined();
    });

    it("cria settlement SCHEDULED com scheduledFor futuro", async () => {
      const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      const res = await request(app)
        .post("/settlements")
        .send({
          merchantId,
          amountCents: 15000,
          currency: "BRL",
          bankAccountId,
          scheduledFor: future,
        });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe("SCHEDULED");
      expect(res.body.scheduledFor).toBe(future);
    });

    it("retorna 400 para payload inválido (amount <= 0)", async () => {
      const res = await request(app)
        .post("/settlements")
        .send({
          merchantId,
          amountCents: 0,
          currency: "BRL",
          bankAccountId,
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("aceita currency diferente se 3 letras (ex.: USD)", async () => {
      const res = await request(app)
        .post("/settlements")
        .send({ merchantId, amountCents: 10000, currency: "USD", bankAccountId });
      expect(res.status).toBe(201);
      expect(res.body.currency).toBe("USD");
    });
  });

  describe("POST /settlements/:id/process - processamento", () => {
    it("processa settlement com sucesso e seta COMPLETED", async () => {
      // Cria settlement PENDING
      const createRes = await request(app)
        .post("/settlements")
        .send({ merchantId, amountCents: 5000, currency: "BRL", bankAccountId });
      const id = createRes.body.id as string;

      const res = await request(app).post(`/settlements/${id}/process`).send({});
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("COMPLETED");
      expect(res.body.transactionId).toBe(forcedTransactionId);
      expect(res.body.processedAt).toBeDefined();
    });

    it("retorna 500 quando adapter bancário lança erro", async () => {
      const createRes = await request(app)
        .post("/settlements")
        .send({ merchantId, amountCents: 8000, currency: "BRL", bankAccountId });
      const id = createRes.body.id as string;

      bankingShouldFail = true;
      bankingFailureReason = "Banking offline";

      const res = await request(app).post(`/settlements/${id}/process`).send({});
      expect(res.status).toBe(500);
      expect(res.body.error.code).toBe("INTERNAL_ERROR");
    });

    it("retorna 500 quando settlement não existe", async () => {
      const unknownId = "c8f5a8f0-2b1a-4f6e-9a3a-9c7b4a1d2e33";
      const res = await request(app).post(`/settlements/${unknownId}/process`).send({});
      expect(res.status).toBe(500);
      expect(res.body.error.code).toBe("INTERNAL_ERROR");
    });

    it("retorna 500 quando não está due (agendado no futuro)", async () => {
      const future = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
      const createRes = await request(app)
        .post("/settlements")
        .send({ merchantId, amountCents: 9000, currency: "BRL", bankAccountId, scheduledFor: future });
      const id = createRes.body.id as string;

      const res = await request(app).post(`/settlements/${id}/process`).send({});
      expect(res.status).toBe(500);
      expect(res.body.error.code).toBe("INTERNAL_ERROR");
      expect(String(res.body.error.message)).toMatch(/not due/i);
    });
  });
});