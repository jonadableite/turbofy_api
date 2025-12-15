import request from "supertest";
import express from "express";
import { chargesRouter } from "../../http/routes/chargesRoutes";
import { Charge } from "../../../domain/entities/Charge";

// Mock PrismaChargeRepository to avoid DB in integration tests
jest.mock("../../database/PrismaChargeRepository", () => {
  const store = new Map<string, Charge>();
  return {
    PrismaChargeRepository: class {
      async findByIdempotencyKey(key: string) {
        return store.get(key);
      }
      async create(charge: Charge) {
        store.set(charge.idempotencyKey, charge);
        return charge;
      }
      async update(charge: Charge) {
        store.set(charge.idempotencyKey, charge);
        return charge;
      }
      async findById() { return undefined; }
      async addSplit() { return undefined as any; }
      async addFee() { return undefined as any; }
    },
  };
});

jest.mock("../../adapters/messaging/MessagingFactory", () => ({
  MessagingFactory: {
    create: () => ({
      publish: jest.fn().mockResolvedValue(undefined),
    }),
  },
}));

jest.mock("../../database/repositories/PrismaPaymentInteractionRepository", () => ({
  PrismaPaymentInteractionRepository: class {
    async create() {
      return undefined;
    }
  },
}));

describe("POST /charges", () => {
  const app = express();
  app.use(express.json());
  app.use("/charges", chargesRouter);
  const merchantId = "8a29e7a2-7b91-4b7a-9b3e-3a0f3d2b1d55";

  it("returns 400 when X-Idempotency-Key header is missing", async () => {
    const res = await request(app)
      .post("/charges")
      .send({ merchantId, amountCents: 1000, method: "PIX", idempotencyKey: "missing-but-body" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("IDEMPOTENCY_KEY_MISSING");
  });

  it("creates a PIX charge and returns payment payload", async () => {
    const res = await request(app)
      .post("/charges")
      .set("X-Idempotency-Key", "route-idem-PIX-001")
      .send({ merchantId, amountCents: 3500, method: "PIX", idempotencyKey: "route-idem-PIX-001" });

    expect(res.status).toBe(201);
    expect(res.body.method).toBe("PIX");
    expect(res.body.pix).toBeDefined();
    expect(res.body.pix.qrCode).toBeDefined();
    expect(res.body.pix.copyPaste).toBeDefined();
  });

  it("is idempotent and returns same charge id on repeated request", async () => {
    const idemKey = "route-idem-PIX-002";
    const first = await request(app)
      .post("/charges")
      .set("X-Idempotency-Key", idemKey)
      .send({ merchantId, amountCents: 1500, method: "PIX", idempotencyKey: idemKey });

    const second = await request(app)
      .post("/charges")
      .set("X-Idempotency-Key", idemKey)
      .send({ merchantId, amountCents: 1500, method: "PIX", idempotencyKey: idemKey });

    expect(second.status).toBe(201);
    expect(second.body.id).toBe(first.body.id);
  });

  it("returns 400 when method is invalid", async () => {
    const res = await request(app)
      .post("/charges")
      .set("X-Idempotency-Key", "route-idem-INVALID-001")
      .send({ merchantId, amountCents: 1000, method: "CARD", idempotencyKey: "route-idem-INVALID-001" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});