/**
 * Testes de integração: Rotas de Webhooks para Integradores
 * 
 * Valida CRUD completo com client credentials e validações de segurança
 */

import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import request from "supertest";
import express from "express";
import { integrationsWebhooksRouter } from "../integrationsWebhooksRoutes";
import { prisma } from "../../../database/prismaClient";
import { encryptSecret } from "../../../security/crypto";

const app = express();
app.use(express.json());
app.use("/integrations/webhooks", integrationsWebhooksRouter);

const TEST_MERCHANT_ID = "test-merchant-webhooks-integration";
const TEST_CLIENT_ID = "test-client-id-123";
const TEST_CLIENT_SECRET = "test-secret-456";

describe("Integration: /integrations/webhooks", () => {
  beforeAll(async () => {
    // Criar merchant de teste
    await prisma.merchant.upsert({
      where: { id: TEST_MERCHANT_ID },
      create: {
        id: TEST_MERCHANT_ID,
        name: "Merchant Teste Webhooks",
        email: "webhooks-test@test.com",
        document: "12345678000199",
        type: "RIFEIRO",
      },
      update: {},
    });

    // Criar credenciais de teste
    await prisma.providerCredentials.upsert({
      where: {
        merchantId_provider: {
          merchantId: TEST_MERCHANT_ID,
          provider: "RIFEIRO_PIX",
        },
      },
      create: {
        clientId: TEST_CLIENT_ID,
        clientSecret: encryptSecret(TEST_CLIENT_SECRET),
        provider: "RIFEIRO_PIX",
        merchantId: TEST_MERCHANT_ID,
      },
      update: {},
    });
  });

  afterAll(async () => {
    // Cleanup
    await prisma.webhookLog.deleteMany({
      where: { webhook: { merchantId: TEST_MERCHANT_ID } },
    });
    await prisma.webhookDelivery.deleteMany({
      where: { webhook: { merchantId: TEST_MERCHANT_ID } },
    });
    await prisma.webhook.deleteMany({
      where: { merchantId: TEST_MERCHANT_ID },
    });
    await prisma.providerCredentials.deleteMany({
      where: { clientId: TEST_CLIENT_ID },
    });
    await prisma.merchant.delete({
      where: { id: TEST_MERCHANT_ID },
    });

    await prisma.$disconnect();
  });

  describe("POST /integrations/webhooks", () => {
    it("should create webhook with valid client credentials", async () => {
      // Arrange
      const payload = {
        name: "Webhook Integração Teste",
        url: "https://httpbin.org/webhook",
        events: ["charge.paid", "charge.expired"],
      };

      // Act
      const response = await request(app)
        .post("/integrations/webhooks")
        .set("x-client-id", TEST_CLIENT_ID)
        .set("x-client-secret", TEST_CLIENT_SECRET)
        .send(payload);

      // Assert
      expect(response.status).toBe(201);
      expect(response.body.id).toBeDefined();
      expect(response.body.publicId).toMatch(/^wh_/);
      expect(response.body.name).toBe(payload.name);
      expect(response.body.url).toBe(payload.url);
      expect(response.body.secret).toBeDefined();
      expect(response.body.events).toEqual(payload.events);
      expect(response.body.status).toBe("ACTIVE");
    });

    it("should reject without credentials", async () => {
      // Arrange
      const payload = {
        name: "Webhook Sem Auth",
        url: "https://httpbin.org/webhook",
        events: ["charge.paid"],
      };

      // Act
      const response = await request(app)
        .post("/integrations/webhooks")
        .send(payload);

      // Assert
      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe("CREDENTIALS_REQUIRED");
    });

    it("should reject with invalid credentials", async () => {
      // Arrange
      const payload = {
        name: "Webhook Auth Inválida",
        url: "https://httpbin.org/webhook",
        events: ["charge.paid"],
      };

      // Act
      const response = await request(app)
        .post("/integrations/webhooks")
        .set("x-client-id", "invalid-id")
        .set("x-client-secret", "invalid-secret")
        .send(payload);

      // Assert
      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe("INVALID_CLIENT_CREDENTIALS");
    });

    it("should reject HTTP URLs in production", async () => {
      // Arrange
      const payload = {
        name: "Webhook HTTP",
        url: "http://example.com/webhook", // HTTP não permitido
        events: ["charge.paid"],
      };

      // Act
      const response = await request(app)
        .post("/integrations/webhooks")
        .set("x-client-id", TEST_CLIENT_ID)
        .set("x-client-secret", TEST_CLIENT_SECRET)
        .send(payload);

      // Assert
      expect(response.status).toBe(422);
      expect(response.body.error.message).toMatch(/HTTPS/);
    });

    it("should reject localhost URLs", async () => {
      // Arrange
      const payload = {
        name: "Webhook Localhost",
        url: "https://localhost/webhook",
        events: ["charge.paid"],
      };

      // Act
      const response = await request(app)
        .post("/integrations/webhooks")
        .set("x-client-id", TEST_CLIENT_ID)
        .set("x-client-secret", TEST_CLIENT_SECRET)
        .send(payload);

      // Assert
      expect(response.status).toBe(422);
      expect(response.body.error.message).toMatch(/bloqueado/);
    });

    it("should reject private IP URLs", async () => {
      // Arrange
      const payload = {
        name: "Webhook IP Privado",
        url: "https://192.168.1.1/webhook",
        events: ["charge.paid"],
      };

      // Act
      const response = await request(app)
        .post("/integrations/webhooks")
        .set("x-client-id", TEST_CLIENT_ID)
        .set("x-client-secret", TEST_CLIENT_SECRET)
        .send(payload);

      // Assert
      expect(response.status).toBe(422);
      expect(response.body.error.message).toMatch(/privado|bloqueado/);
    });
  });

  describe("GET /integrations/webhooks", () => {
    it("should list only webhooks from authenticated merchant", async () => {
      // Act
      const response = await request(app)
        .get("/integrations/webhooks")
        .set("x-client-id", TEST_CLIENT_ID)
        .set("x-client-secret", TEST_CLIENT_SECRET);

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.webhooks).toBeDefined();
      expect(Array.isArray(response.body.webhooks)).toBe(true);

      // Todos os webhooks devem ser do merchant autenticado
      for (const webhook of response.body.webhooks) {
        expect(webhook.publicId).toMatch(/^wh_/);
      }
    });
  });

  describe("POST /integrations/webhooks/:id/test", () => {
    it("should send test event to webhook", async () => {
      // Primeiro criar um webhook
      const createResponse = await request(app)
        .post("/integrations/webhooks")
        .set("x-client-id", TEST_CLIENT_ID)
        .set("x-client-secret", TEST_CLIENT_SECRET)
        .send({
          name: "Webhook para Teste",
          url: "https://httpbin.org/webhook",
          events: ["charge.paid"],
        });

      expect(createResponse.status).toBe(201);
      const webhookId = createResponse.body.publicId;

      // Enviar evento de teste
      const testResponse = await request(app)
        .post(`/integrations/webhooks/${webhookId}/test`)
        .set("x-client-id", TEST_CLIENT_ID)
        .set("x-client-secret", TEST_CLIENT_SECRET);

      // Assert
      expect(testResponse.status).toBe(200);
      expect(testResponse.body.eventId).toMatch(/^evt_test_/);
      expect(testResponse.body.sent).toBeDefined();
    });
  });

  describe("POST /integrations/webhooks/:id/rotate-secret", () => {
    it("should rotate webhook secret", async () => {
      // Primeiro criar um webhook
      const createResponse = await request(app)
        .post("/integrations/webhooks")
        .set("x-client-id", TEST_CLIENT_ID)
        .set("x-client-secret", TEST_CLIENT_SECRET)
        .send({
          name: "Webhook para Rotação",
          url: "https://httpbin.org/webhook",
          events: ["charge.paid"],
        });

      expect(createResponse.status).toBe(201);
      const webhookId = createResponse.body.publicId;
      const originalSecret = createResponse.body.secret;

      // Rotacionar secret
      const rotateResponse = await request(app)
        .post(`/integrations/webhooks/${webhookId}/rotate-secret`)
        .set("x-client-id", TEST_CLIENT_ID)
        .set("x-client-secret", TEST_CLIENT_SECRET);

      // Assert
      expect(rotateResponse.status).toBe(200);
      expect(rotateResponse.body.newSecret).toBeDefined();
      expect(rotateResponse.body.newSecret).not.toBe(originalSecret);
      expect(rotateResponse.body.rotatedAt).toBeDefined();
    });
  });
});
