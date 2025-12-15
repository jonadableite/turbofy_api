export interface CreateWebhookLogInput {
  webhookId: string;
  event: string;
  payload: unknown;
  responseCode: number | null;
  responseBody: string | null;
  responseTimeMs: number | null;
  success: boolean;
  errorMessage: string | null;
  attemptNumber: number;
}

export interface WebhookLogRepository {
  create(input: CreateWebhookLogInput): Promise<void>;
}

