export interface WebhookAttemptRecord {
  provider: string;
  type: string;
  eventId: string;
  status: string;
  attempt: number;
  signatureValid: boolean;
  errorMessage?: string;
  payload: Record<string, unknown>;
}

export interface WebhookAttemptRepository {
  record(attempt: WebhookAttemptRecord): Promise<void>;
}
