import request from "supertest";
import express from "express";
import { chargesRouter } from "../../http/routes/chargesRoutes";
import { Charge, ChargeMethod } from "../../../domain/entities/Charge";
import { ChargeSplit } from "../../../domain/entities/ChargeSplit";
import { Fee } from "../../../domain/entities/Fee";

// In-memory store to simulate DB for charges, splits and fees
const chargesByIdem = new Map<string, Charge>();
const splitsByChargeId: Record<string, ChargeSplit[]> = {};
const feesByChargeId: Record<string, Fee[]> = {};

jest.mock("../../database/PrismaChargeRepository", () => {
  return {
    PrismaChargeRepository: class {
      async findByIdempotencyKey(key: string) {
        return chargesByIdem.get(key) ?? null;
      }
      async create(charge: Charge) {
        chargesByIdem.set(charge.idempotencyKey, charge);
        return charge;
      }
      async update(charge: Charge) {
        chargesByIdem.set(charge.idempotencyKey, charge);
        return charge;
      }
      async findById() { return null; }
      async addSplit(chargeId: string, split: ChargeSplit) {
        if (!splitsByChargeId[chargeId]) splitsByChargeId[chargeId] = [];
        const amount = split.amountCents ?? split.computeAmountForTotal(chargesByIdem.values().next().value?.amountCents ?? 0);
        const persisted = new ChargeSplit({
          id: split.id,
          chargeId,
          merchantId: split.merchantId,
          amountCents: amount,
          percentage: split.percentage,
          createdAt: new Date(),
        });
        splitsByChargeId[chargeId].push(persisted);
        return persisted;
      }
      async addFee(chargeId: string, fee: Fee) {
        if (!feesByChargeId[chargeId]) feesByChargeId[chargeId] = [];
        const persisted = new Fee({
          id: fee.id,
          chargeId,
          type: fee.type,
          amountCents: fee.amountCents,
          createdAt: new Date(),
        });
        feesByChargeId[chargeId].push(persisted);
        return persisted;
      }
    },
  };
});

describe("chargesRoutes extended", () => {
  const app = express();
  app.use(express.json());
  app.use("/charges", chargesRouter);
  const merchantId = "8a29e7a2-7b91-4b7a-9b3e-3a0f3d2b1d55";

  beforeEach(() => {
    chargesByIdem.clear();
    for (const k of Object.keys(splitsByChargeId)) delete splitsByChargeId[k];
    for (const k of Object.keys(feesByChargeId)) delete feesByChargeId[k];
  });

  it("retorna 400 para currency não suportada (USD)", async () => {
    const res = await request(app)
      .post("/charges")
      .set("X-Idempotency-Key", "idem-currency-001")
      .send({ merchantId, amountCents: 1000, currency: "USD", method: "PIX", idempotencyKey: "idem-currency-001" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("usa currency padrão BRL quando omitida", async () => {
    const res = await request(app)
      .post("/charges")
      .set("X-Idempotency-Key", "idem-currency-002")
      .send({ merchantId, amountCents: 2000, method: "PIX", idempotencyKey: "idem-currency-002" });
    expect(res.status).toBe(201);
    expect(res.body.currency).toBe("BRL");
  });

  it("cria cobrança BOLETO e retorna boleto payload", async () => {
    const res = await request(app)
      .post("/charges")
      .set("X-Idempotency-Key", "idem-boleto-001")
      .send({ merchantId, amountCents: 3500, method: "BOLETO", idempotencyKey: "idem-boleto-001" });
    expect(res.status).toBe(201);
    expect(res.body.method).toBe("BOLETO");
    expect(res.body.boleto).toBeDefined();
    expect(res.body.boleto.boletoUrl).toMatch(/https:\/\/boleto\.turbofy\/pay\//);
  });

  it("retorna splits quando fornecidos por percentual", async () => {
    const idem = "idem-splits-001";
    const amountCents = 10000; // R$ 100,00
    const res = await request(app)
      .post("/charges")
      .set("X-Idempotency-Key", idem)
      .send({
        merchantId,
        amountCents,
        method: "PIX",
        idempotencyKey: idem,
        splits: [
          { merchantId: merchantId, percentage: 30 },
          { merchantId: "2530b2a3-6c5f-4b21-9a2e-f5c8d0e7a9b1", percentage: 20 },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.splits).toBeDefined();
    // Expect 2 splits totaling <= amount
    const total = res.body.splits.reduce((acc: number, s: any) => acc + s.amountCents, 0);
    expect(total).toBeLessThanOrEqual(amountCents);
    expect(res.body.splits[0].percentage).toBe(30);
    expect(res.body.splits[1].percentage).toBe(20);
  });

  it("retorna 500 quando fees excedem o valor da cobrança", async () => {
    const idem = "idem-fees-001";
    const res = await request(app)
      .post("/charges")
      .set("X-Idempotency-Key", idem)
      .send({
        merchantId,
        amountCents: 1000,
        method: "PIX",
        idempotencyKey: idem,
        fees: [
          { type: "platform", amountCents: 800 },
          { type: "processor", amountCents: 500 }, // total 1300 > 1000
        ],
      });
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("INTERNAL_ERROR");
  });

  it("cria cobrança sem method e retorna method null com payload vazio", async () => {
    const idem = "idem-no-method-001";
    const res = await request(app)
      .post("/charges")
      .set("X-Idempotency-Key", idem)
      .send({ merchantId, amountCents: 2500, idempotencyKey: idem });
    expect(res.status).toBe(201);
    expect(res.body.method).toBeNull();
    expect(res.body.pix).toBeUndefined();
    expect(res.body.boleto).toBeUndefined();
    expect(res.body.currency).toBe("BRL"); // default
  });

  it("retorna 400 para expiresAt inválido (não-ISO)", async () => {
    const idem = "idem-exp-invalid-001";
    const res = await request(app)
      .post("/charges")
      .set("X-Idempotency-Key", idem)
      .send({ merchantId, amountCents: 2500, idempotencyKey: idem, expiresAt: "2024-13-99" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("inclui metadata quando fornecido", async () => {
    const idem = "idem-metadata-001";
    const meta = { orderId: "ORD-123", campaign: "BLACKFRIDAY" };
    const res = await request(app)
      .post("/charges")
      .set("X-Idempotency-Key", idem)
      .send({ merchantId, amountCents: 5000, method: "PIX", idempotencyKey: idem, metadata: meta });
    expect(res.status).toBe(201);
    expect(res.body.metadata).toEqual(meta);
  });

  it("retorna fees quando dentro do limite do valor da cobrança", async () => {
    const idem = "idem-fees-002";
    const res = await request(app)
      .post("/charges")
      .set("X-Idempotency-Key", idem)
      .send({
        merchantId,
        amountCents: 2000,
        method: "PIX",
        idempotencyKey: idem,
        fees: [
          { type: "platform", amountCents: 300 },
          { type: "processor", amountCents: 200 },
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body.fees).toBeDefined();
    expect(res.body.fees.length).toBe(2);
    expect(res.body.fees[0]).toMatchObject({ type: "platform", amountCents: 300 });
    expect(res.body.fees[1]).toMatchObject({ type: "processor", amountCents: 200 });
  });
});