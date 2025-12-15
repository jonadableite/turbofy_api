import crypto from "crypto";
import express from "express";
import request from "supertest";
import { Charge, ChargeStatus } from "../../../domain/entities/Charge";
import { PrismaChargeRepository } from "../../database/PrismaChargeRepository";
import { transfeeraWebhookRouter } from "../routes/transfeeraWebhookRoutes";

process.env.TRANSFEERA_WEBHOOK_SECRET = "y".repeat(32);

jest.mock("../../database/PrismaChargeRepository");
jest.mock("../../database/PrismaWebhookAttemptRepository");
jest.mock("../../database/repositories/PrismaPaymentInteractionRepository", () => ({
  PrismaPaymentInteractionRepository: class {
    async create() { return undefined; }
    async findByChargeId() { return []; }
  },
}));

describe("Transfeera webhook matching by txid", () => {
  const app = express();
  app.use(express.json({ verify: (req: any, _res, buf) => { req.rawBody = buf; } }));
  app.use("/webhooks/transfeera", transfeeraWebhookRouter);

  it("marks charge as paid when matched by txid", async () => {
    const repo = jest.mocked(PrismaChargeRepository);
    const charge = new Charge({ merchantId: "m1", amountCents: 1000, idempotencyKey: "idem", pixTxid: "tx123" });
    (repo.prototype.findByExternalRef as any).mockResolvedValue(null);
    (repo.prototype.findByTxid as any).mockResolvedValue(charge);
    (repo.prototype.update as any).mockImplementation(async (c: Charge) => ({ ...c, status: ChargeStatus.PAID }));

    const body = { id: "e3", object: "CashIn", data: { txid: "tx123", value: 1000, end2end_id: "e2e", pix_key: "k" } };
    const raw = Buffer.from(JSON.stringify(body));
    const sig = crypto.createHmac("sha256", process.env.TRANSFEERA_WEBHOOK_SECRET as string).update(raw).digest("hex");
    const res = await request(app)
      .post("/webhooks/transfeera")
      .set("X-Hub-Signature-256", `sha256=${sig}`)
      .send(body);
    expect(res.status).toBe(200);
    await new Promise((r) => setTimeout(r, 200));
    expect(repo.prototype.findByTxid).toHaveBeenCalledWith("tx123");
    expect(repo.prototype.update).toHaveBeenCalled();
  });
});
