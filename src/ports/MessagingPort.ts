export interface OutboundEvent<TPayload = unknown> {
  id: string;
  type: string; // ex.: charge.created
  timestamp: string; // ISO-8601
  version: string; // ex.: v1
  traceId?: string;
  idempotencyKey?: string;
  routingKey?: string; // ex.: turbofy.payments.charge.created
  payload: TPayload;
}

export interface MessagingPort {
  publish(event: OutboundEvent): Promise<void>;
}