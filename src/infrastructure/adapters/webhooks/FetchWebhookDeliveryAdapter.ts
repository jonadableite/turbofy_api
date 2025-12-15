import { WebhookDeliveryPort, WebhookDeliveryRequest, WebhookDeliveryResponse } from "../../../ports/WebhookDeliveryPort";

export class FetchWebhookDeliveryAdapter implements WebhookDeliveryPort {
  async post(request: WebhookDeliveryRequest): Promise<WebhookDeliveryResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), request.timeoutMs);

    try {
      const res = await fetch(request.url, {
        method: "POST",
        headers: request.headers,
        body: request.body,
        signal: controller.signal,
      });

      const responseBody = await res.text();
      return { status: res.status, responseBody };
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

