import request from "supertest";
import express from "express";
import { reconciliationsRouter } from "../../http/routes/reconciliationsRoutes";
import { Reconciliation } from "../../../domain/entities/Reconciliation";

// Mock PrismaReconciliationRepository and PrismaChargeRepository to avoid DB in integration tests
jest.mock("../../database/PrismaReconciliationRepository", () => {
  return {
    PrismaReconciliationRepository: class {
      async findById() { return null; }
      async findByMerchantId() { return []; }
      async findByDateRange() { return []; }
      async create(reconciliation: Reconciliation) { return reconciliation; }
      async update(reconciliation: Reconciliation) { return reconciliation; }
    },
  };
});

jest.mock("../../database/PrismaChargeRepository", () => {
  return {
    PrismaChargeRepository: class {},
  };
});

jest.mock("../../adapters/messaging/MessagingFactory", () => ({
  MessagingFactory: {
    create: () => ({
      publish: jest.fn().mockResolvedValue(undefined),
    }),
  },
}));

describe("POST /reconciliations", () => {
  const app = express();
  app.use(express.json());
  app.use("/reconciliations", reconciliationsRouter);
  const merchantId = "8a29e7a2-7b91-4b7a-9b3e-3a0f3d2b1d55";

  it("returns 400 when type is invalid", async () => {
    const res = await request(app)
      .post("/reconciliations")
      .send({
        merchantId,
        startDate: new Date().toISOString(),
        endDate: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        type: "INVALID",
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("creates reconciliation with AUTOMATIC type", async () => {
    const res = await request(app)
      .post("/reconciliations")
      .send({
        merchantId,
        startDate: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        endDate: new Date().toISOString(),
        type: "AUTOMATIC",
      });

    expect(res.status).toBe(201);
    expect(res.body.type).toBe("AUTOMATIC");
    expect(["PENDING", "PROCESSING", "COMPLETED", "FAILED", "PARTIAL"]).toContain(res.body.status);
  });
});