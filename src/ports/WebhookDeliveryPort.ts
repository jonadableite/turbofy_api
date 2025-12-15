export interface WebhookDeliveryRequest {
  url: string;
  headers: Record<string, string>;
  body: string;
  timeoutMs: number;
}

export interface WebhookDeliveryResponse {
  status: number;
  responseBody: string;
}

export interface WebhookDeliveryPort {
  post(request: WebhookDeliveryRequest): Promise<WebhookDeliveryResponse>;
}

