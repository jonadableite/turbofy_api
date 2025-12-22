/**
 * Testes unitários: DispatchWebhooks (Refatorado)
 * 
 * Valida publicação de eventos no RabbitMQ para processamento assíncrono
 */

import { describe, it, expect, jest } from "@jest/globals";
import { DispatchWebhooks } from "../DispatchWebhooks";
import { MessagingPort, OutboundEvent } from "../../../ports/MessagingPort";

describe("DispatchWebhooks (Refatorado)", () => {
  it("should publish event to RabbitMQ with correct routing key", async () => {
    // Arrange
    const publishSpy: jest.MockedFunction<MessagingPort["publish"]> = jest.fn(
      async (_event: OutboundEvent) => {
        return;
      }
    );
    const messaging: MessagingPort = { publish: publishSpy };

    const useCase = new DispatchWebhooks(messaging);

    const input = {
      merchantId: "merchant-123",
      event: "charge.paid",
      devMode: false,
      traceId: "trace-abc",
      data: { chargeId: "charge-123", amountCents: 10000 },
    };

    // Act
    const result = await useCase.execute(input);

    // Assert
    expect(result.published).toBe(true);
    expect(result.eventId).toMatch(/^evt_/);

    expect(publishSpy).toHaveBeenCalledTimes(1);
    const publishedEvent = publishSpy.mock.calls[0][0] as OutboundEvent;

    expect(publishedEvent.type).toBe("webhook.dispatch");
    expect(publishedEvent.routingKey).toBe("turbofy.webhooks.charge.paid");
    expect(publishedEvent.version).toBe("v1");
    expect(publishedEvent.payload).toEqual(
      expect.objectContaining({
        type: "charge.paid",
        merchantId: "merchant-123",
        data: input.data,
      })
    );
  });

  it("should include traceId in published event", async () => {
    // Arrange
    const publishSpy: jest.MockedFunction<MessagingPort["publish"]> = jest.fn(
      async (_event: OutboundEvent) => {
        return;
      }
    );
    const messaging: MessagingPort = { publish: publishSpy };
    const useCase = new DispatchWebhooks(messaging);

    // Act
    await useCase.execute({
      merchantId: "merchant-123",
      event: "charge.expired",
      devMode: false,
      traceId: "trace-xyz",
      data: {},
    });

    // Assert
    const publishedEvent = publishSpy.mock.calls[0][0] as OutboundEvent;
    expect(publishedEvent.traceId).toBe("trace-xyz");
  });
});

