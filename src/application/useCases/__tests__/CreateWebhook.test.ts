/**
 * Testes unitários: CreateWebhook
 * 
 * Valida limites por merchant e regras de criação
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { CreateWebhook, WebhookLimitExceededError } from "../CreateWebhook";
import { Webhook } from "../../../domain/entities/Webhook";
import { WebhookRepository } from "../../../ports/repositories/WebhookRepository";

// Mock do repository
class MockWebhookRepository implements WebhookRepository {
  private webhooks: Webhook[] = [];
  private merchantWebhookCounts: Map<string, number> = new Map();

  async countByMerchantId(merchantId: string): Promise<number> {
    return this.merchantWebhookCounts.get(merchantId) ?? 0;
  }

  async save(webhook: Webhook): Promise<Webhook> {
    this.webhooks.push(webhook);
    const currentCount = this.merchantWebhookCounts.get(webhook.merchantId) ?? 0;
    this.merchantWebhookCounts.set(webhook.merchantId, currentCount + 1);
    return webhook;
  }

  async findById(id: string): Promise<Webhook | null> {
    return this.webhooks.find((w) => w.id === id) ?? null;
  }

  async findByPublicId(publicId: string): Promise<Webhook | null> {
    return this.webhooks.find((w) => w.publicId === publicId) ?? null;
  }

  async findActiveByEvent(
    merchantId: string,
    event: string,
    devMode: boolean
  ): Promise<Webhook[]> {
    return this.webhooks.filter(
      (w) =>
        w.merchantId === merchantId &&
        w.isActive() &&
        w.hasEvent(event) &&
        w.devMode === devMode
    );
  }

  async update(webhook: Webhook): Promise<Webhook> {
    const index = this.webhooks.findIndex((w) => w.id === webhook.id);
    if (index !== -1) {
      this.webhooks[index] = webhook;
    }
    return webhook;
  }

  async findByMerchantId(merchantId: string): Promise<Webhook[]> {
    return this.webhooks.filter((w) => w.merchantId === merchantId);
  }

  async delete(id: string): Promise<void> {
    const index = this.webhooks.findIndex((w) => w.id === id);
    if (index !== -1) {
      this.webhooks.splice(index, 1);
      // Atualizar contagem
      const webhook = this.webhooks[index];
      if (webhook) {
        const currentCount = this.merchantWebhookCounts.get(webhook.merchantId) ?? 0;
        this.merchantWebhookCounts.set(webhook.merchantId, Math.max(0, currentCount - 1));
      }
    }
  }

  // Mock: Simular contagem de webhooks
  setMerchantWebhookCount(merchantId: string, count: number): void {
    this.merchantWebhookCounts.set(merchantId, count);
  }
}

describe("CreateWebhook", () => {
  let repository: MockWebhookRepository;
  let useCase: CreateWebhook;

  beforeEach(() => {
    repository = new MockWebhookRepository();
    useCase = new CreateWebhook(repository);
  });

  describe("execute - Success cases", () => {
    it("should create webhook with valid data", async () => {
      // Arrange
      const request = {
        merchantId: "merchant-123",
        name: "Webhook de Teste",
        url: "https://example.com/webhook",
        events: ["charge.paid", "charge.expired"],
        devMode: false,
      };

      // Act
      const result = await useCase.execute(request);

      // Assert
      expect(result.id).toBeDefined();
      expect(result.publicId).toMatch(/^wh_/);
      expect(result.merchantId).toBe(request.merchantId);
      expect(result.name).toBe(request.name);
      expect(result.url).toBe(request.url);
      expect(result.events).toEqual(request.events);
      expect(result.secret).toBeDefined();
      expect(result.secret.length).toBeGreaterThan(0);
      expect(result.status).toBe("ACTIVE");
      expect(result.devMode).toBe(false);
    });

    it("should generate unique publicId and secret", async () => {
      // Arrange
      const request = {
        merchantId: "merchant-123",
        name: "Webhook 1",
        url: "https://example.com/webhook",
        events: ["charge.paid"],
      };

      // Act
      const result1 = await useCase.execute(request);
      const result2 = await useCase.execute({
        ...request,
        name: "Webhook 2",
      });

      // Assert
      expect(result1.publicId).not.toBe(result2.publicId);
      expect(result1.secret).not.toBe(result2.secret);
    });
  });

  describe("execute - Limit enforcement", () => {
    it("should reject when merchant has reached limit", async () => {
      // Arrange
      const merchantId = "merchant-123";
      repository.setMerchantWebhookCount(merchantId, 10); // Limite = 10

      const request = {
        merchantId,
        name: "Webhook Extra",
        url: "https://example.com/webhook",
        events: ["charge.paid"],
      };

      // Act & Assert
      await expect(useCase.execute(request)).rejects.toThrow(
        WebhookLimitExceededError
      );

      await expect(useCase.execute(request)).rejects.toThrow(/10 webhooks/);
    });

    it("should allow creating webhook when under limit", async () => {
      // Arrange
      const merchantId = "merchant-123";
      repository.setMerchantWebhookCount(merchantId, 9); // Abaixo do limite

      const request = {
        merchantId,
        name: "Webhook 10",
        url: "https://example.com/webhook",
        events: ["charge.paid"],
      };

      // Act
      const result = await useCase.execute(request);

      // Assert
      expect(result.id).toBeDefined();
    });
  });

  describe("execute - Event validation", () => {
    it("should reject invalid events", async () => {
      // Arrange
      const request = {
        merchantId: "merchant-123",
        name: "Webhook Inválido",
        url: "https://example.com/webhook",
        events: ["charge.paid", "evento.invalido"],
      };

      // Act & Assert
      await expect(useCase.execute(request)).rejects.toThrow();
    });

    it("should accept all valid events", async () => {
      // Arrange
      const request = {
        merchantId: "merchant-123",
        name: "Webhook Completo",
        url: "https://example.com/webhook",
        events: [
          "charge.created",
          "charge.paid",
          "charge.expired",
          "billing.paid",
          "withdraw.done",
        ],
      };

      // Act
      const result = await useCase.execute(request);

      // Assert
      expect(result.events).toEqual(request.events);
    });
  });
});
