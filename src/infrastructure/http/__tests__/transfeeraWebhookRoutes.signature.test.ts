import request from "supertest";
import express from "express";
import crypto from "crypto";
import { PrismaWebhookAttemptRepository } from "../../database/PrismaWebhookAttemptRepository";

jest.mock("../../../config/env", () => ({
  env: {
    NODE_ENV: "test",
    TRANSFEERA_WEBHOOK_SECRET: "x".repeat(32),
    TURBOFY_CREDENTIALS_ENC_KEY: "a".repeat(32),
  },
}));

describe("Transfeera webhook signature", () => {
  const buildApp = () => {
    const app = express();
    app.use(
      express.json({
        verify: (req: any, _res, buf) => {
          req.rawBody = buf;
        },
      })
    );
    // Importa router após configurar variáveis de ambiente
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { transfeeraWebhookRouter } = require("../routes/transfeeraWebhookRoutes");
    app.use("/webhooks/transfeera", transfeeraWebhookRouter);
    return app;
  };

  it("rejects when signature is missing in production mode", async () => {
    const body = { id: "e1", object: "CashIn", data: {} };
    const prevEnv = process.env.NODE_ENV;
    const prevSecret = process.env.TRANSFEERA_WEBHOOK_SECRET;
    // Ensure production mode AND a secret is configured (otherwise validation is skipped)
    process.env.NODE_ENV = "production";
    process.env.TRANSFEERA_WEBHOOK_SECRET = "a".repeat(32);
    const app = buildApp();
    const res = await request(app).post("/webhooks/transfeera").send(body);
    process.env.NODE_ENV = prevEnv;
    process.env.TRANSFEERA_WEBHOOK_SECRET = prevSecret;
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("INVALID_SIGNATURE");
  });

  it("accepts with valid HMAC-SHA256 signature", async () => {
    const app = buildApp();
    process.env.NODE_ENV = "production";
    process.env.TRANSFEERA_WEBHOOK_SECRET = "x".repeat(32);
    const body = { id: "e2", object: "CashIn", data: {} };
    const raw = Buffer.from(JSON.stringify(body));
    const sig = crypto.createHmac("sha256", process.env.TRANSFEERA_WEBHOOK_SECRET as string).update(raw).digest("hex");
    const res = await request(app)
      .post("/webhooks/transfeera")
      .set("X-Transfeera-Signature", sig)
      .send(body);
    process.env.NODE_ENV = "test";
    expect(res.status).toBe(200);
    expect(res.body.received).toBe(true);
  });
});
jest.mock("../../database/PrismaWebhookAttemptRepository");
jest.mock("../../database/repositories/PrismaPaymentInteractionRepository", () => ({
  PrismaPaymentInteractionRepository: class {
    async create() { return undefined; }
    async findByChargeId() { return []; }
  },
}));
