import request from "supertest";
import express from "express";
import crypto from "crypto";
import { transfeeraWebhookRouter } from "../routes/transfeeraWebhookRoutes";
import { PrismaChargeRepository } from "../../database/PrismaChargeRepository";
import { PrismaWebhookAttemptRepository } from "../../database/PrismaWebhookAttemptRepository";

process.env.TRANSFEERA_WEBHOOK_SECRET = "z".repeat(32);

jest.mock("../../database/PrismaChargeRepository");
jest.mock("../../database/PrismaWebhookAttemptRepository");
jest.mock("../../database/repositories/PrismaPaymentInteractionRepository", () => ({
  PrismaPaymentInteractionRepository: class {
    async create() { return undefined; }
    async findByChargeId() { return []; }
  },
}));

describe("Transfeera webhook retry and attempt recording", () => {
  const app = express();
  app.use(express.json({ verify: (req: any, _res, buf) => { req.rawBody = buf; } }));
  app.use("/webhooks/transfeera", transfeeraWebhookRouter);

  it("records failed attempts and retries up to 5", async () => {
    const chargeRepo = jest.mocked(PrismaChargeRepository);
    const attemptsRepo = jest.mocked(PrismaWebhookAttemptRepository);
    (chargeRepo.prototype.findByExternalRef as any).mockImplementation(async () => { throw new Error("db error"); });
    const recordMock = jest.fn(async () => {});
    (attemptsRepo.prototype.record as any) = recordMock;

    const body = { id: "e4", object: "CashIn", data: { integration_id: "ext-1" } };
    const raw = Buffer.from(JSON.stringify(body));
    const sig = crypto.createHmac("sha256", process.env.TRANSFEERA_WEBHOOK_SECRET as string).update(raw).digest("hex");
    const res = await request(app)
      .post("/webhooks/transfeera")
      .set("X-Hub-Signature-256", `sha256=${sig}`)
      .send(body);
    expect(res.status).toBe(200);
    expect(recordMock).toHaveBeenCalled();
  });
});
