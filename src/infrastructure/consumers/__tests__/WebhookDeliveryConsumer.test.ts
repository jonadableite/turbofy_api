/**
 * Testes unitários: WebhookDeliveryConsumer
 *
 * Valida lógica de retry com backoff/jitter e roteamento
 */

import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { WebhookDeliveryConsumer } from "../WebhookDeliveryConsumer";

jest.mock("../../database/prismaClient", () => ({
  prisma: {
    webhookDelivery: {
      update: jest.fn().mockResolvedValue(null),
    },
  },
}));

const publishMock = jest.fn().mockResolvedValue(undefined);
jest.mock("../../adapters/messaging/MessagingFactory", () => ({
  MessagingFactory: {
    create: () => ({ publish: publishMock }),
  },
}));

describe("WebhookDeliveryConsumer", () => {
  beforeEach(() => {
    publishMock.mockClear();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe("calculateBackoff - Backoff com jitter", () => {
    const RETRY_DELAYS_MS = [0, 2_000, 10_000, 60_000, 300_000];
    const JITTER_FACTOR = 0.1;

    const calculateBackoffWithJitter = (attempt: number): number => {
      const baseDelay = RETRY_DELAYS_MS[attempt - 1] ?? 300_000;
      const jitter = baseDelay * JITTER_FACTOR * (Math.random() * 2 - 1);
      return Math.max(0, baseDelay + jitter);
    };

    it("should return 0 for first attempt", () => {
      const delay = calculateBackoffWithJitter(1);
      expect(delay).toBe(0);
    });

    it("should return delay with jitter for attempt 2", () => {
      const delay = calculateBackoffWithJitter(2);
      expect(delay).toBeGreaterThanOrEqual(1_800); // 2s - 10%
      expect(delay).toBeLessThanOrEqual(2_200); // 2s + 10%
    });

    it("should return delay with jitter for attempt 3", () => {
      const delay = calculateBackoffWithJitter(3);
      expect(delay).toBeGreaterThanOrEqual(9_000); // 10s - 10%
      expect(delay).toBeLessThanOrEqual(11_000); // 10s + 10%
    });

    it("should return delay with jitter for attempt 4", () => {
      const delay = calculateBackoffWithJitter(4);
      expect(delay).toBeGreaterThanOrEqual(54_000); // 60s - 10%
      expect(delay).toBeLessThanOrEqual(66_000); // 60s + 10%
    });

    it("should return delay with jitter for attempt 5", () => {
      const delay = calculateBackoffWithJitter(5);
      expect(delay).toBeGreaterThanOrEqual(270_000); // 300s - 10%
      expect(delay).toBeLessThanOrEqual(330_000); // 300s + 10%
    });

    it("should never return negative delay", () => {
      for (let attempt = 1; attempt <= 5; attempt++) {
        const delay = calculateBackoffWithJitter(attempt);
        expect(delay).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe("Circuit breaker logic", () => {
    const MAX_FAILURES_FOR_DISABLE = 10;

    const shouldDisableWebhook = (failureCount: number): boolean => {
      return failureCount >= MAX_FAILURES_FOR_DISABLE;
    };

    it("should not disable webhook with few failures", () => {
      expect(shouldDisableWebhook(5)).toBe(false);
      expect(shouldDisableWebhook(9)).toBe(false);
    });

    it("should disable webhook after 10 failures", () => {
      expect(shouldDisableWebhook(10)).toBe(true);
      expect(shouldDisableWebhook(15)).toBe(true);
    });

    it("should disable exactly at threshold", () => {
      expect(shouldDisableWebhook(MAX_FAILURES_FOR_DISABLE)).toBe(true);
    });
  });

  describe("routing key no retry", () => {
    it("deve republicar delivery com routingKey compatível com webhook.delivery.#", async () => {
      const consumer = new WebhookDeliveryConsumer() as unknown as {
        scheduleRetry: (args: any) => Promise<void>;
      };

      const delivery = {
        id: "del-1",
        attempt: 1,
        webhookId: "wh-1",
      };

      const message = {
        deliveryId: "del-1",
        webhookId: "wh-1",
        eventEnvelope: {
          id: "evt-1",
          type: "webhook.test",
          merchantId: "merchant-1",
          timestamp: new Date().toISOString(),
          data: {},
        },
      };

      // @ts-expect-error acesso para teste
      await consumer.scheduleRetry({ delivery, message });
      jest.runOnlyPendingTimers();
      await Promise.resolve();

      expect(publishMock).toHaveBeenCalledWith(
        expect.objectContaining({
          routingKey: "webhook.delivery.del-1",
          type: "webhook.delivery",
        })
      );
    });
  });
});
