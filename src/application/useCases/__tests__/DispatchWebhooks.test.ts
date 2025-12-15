import { createHmac } from "crypto";
import { Webhook } from "../../../domain/entities/Webhook";
import { WebhookDeliveryPort } from "../../../ports/WebhookDeliveryPort";
import { WebhookLogRepository } from "../../../ports/repositories/WebhookLogRepository";
import { WebhookRepository } from "../../../ports/repositories/WebhookRepository";
import { DispatchWebhooks } from "../DispatchWebhooks";

const buildWebhook = (): Webhook => {
  const now = new Date("2025-01-01T00:00:00.000Z");
  return Webhook.fromPersistence({
    id: "wh-internal-1",
    publicId: "wh_public_1",
    merchantId: "merchant-1",
    name: "Webhook Teste",
    url: "https://example.com/webhook",
    secret: "secret-hex-123",
    events: ["charge.paid"],
    status: "ACTIVE",
    failureCount: 0,
    lastCalledAt: null,
    lastSuccess: null,
    lastFailure: null,
    lastError: null,
    devMode: false,
    createdAt: now,
    updatedAt: now,
  });
};

describe("DispatchWebhooks", () => {
  it("envia payload assinado e registra log de sucesso", async () => {
    const wh = buildWebhook();

    const webhookRepository: WebhookRepository = {
      save: jest.fn(),
      findById: jest.fn(),
      findByPublicId: jest.fn(),
      findByMerchantId: jest.fn(),
      findActiveByEvent: jest.fn().mockResolvedValue([wh]),
      update: jest.fn().mockImplementation(async (w: Webhook) => w),
      delete: jest.fn(),
      countByMerchantId: jest.fn(),
    };

    const webhookLogRepository: WebhookLogRepository = {
      create: jest.fn(),
    };

    const delivery: WebhookDeliveryPort = {
      post: jest.fn().mockResolvedValue({ status: 200, responseBody: "ok" }),
    };

    const nowMs = 1735689600123;
    jest.spyOn(Date, "now").mockReturnValue(nowMs);

    const useCase = new DispatchWebhooks(
      webhookRepository,
      webhookLogRepository,
      delivery
    );

    const result = await useCase.execute({
      merchantId: "merchant-1",
      event: "charge.paid",
      devMode: false,
      traceId: "trace-1",
      data: { chargeId: "charge-1" },
    });

    expect(result.attempted).toBe(1);
    expect(result.delivered).toBe(1);

    const call = (delivery.post as jest.Mock).mock.calls[0]?.[0] as {
      url: string;
      headers: Record<string, string>;
      body: string;
      timeoutMs: number;
    };

    expect(call.url).toBe("https://example.com/webhook");

    const signatureHeader = call.headers["turbofy-signature"];
    expect(signatureHeader).toBeDefined();

    const expectedSig = createHmac("sha256", wh.secret)
      .update(`${nowMs}.${call.body}`)
      .digest("hex");

    expect(signatureHeader).toBe(`t=${nowMs},v1=${expectedSig}`);

    expect(webhookLogRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        webhookId: wh.id,
        event: "charge.paid",
        success: true,
        responseCode: 200,
      })
    );
  });
});

