import { Prisma, PrismaClient } from "@prisma/client";
import {
    CreateWebhookLogInput,
    WebhookLogRepository,
} from "../../../ports/repositories/WebhookLogRepository";

const MAX_RESPONSE_BODY_CHARS = 10_000;

export class PrismaWebhookLogRepository implements WebhookLogRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: CreateWebhookLogInput): Promise<void> {
    const payload = input.payload as Prisma.InputJsonValue;
    await this.prisma.webhookLog.create({
      data: {
        webhookId: input.webhookId,
        event: input.event,
        payload,
        responseCode: input.responseCode ?? null,
        responseBody: input.responseBody
          ? input.responseBody.slice(0, MAX_RESPONSE_BODY_CHARS)
          : null,
        responseTime: input.responseTimeMs ?? null,
        success: input.success,
        errorMessage: input.errorMessage ?? null,
        attemptNumber: input.attemptNumber,
      },
    });
  }
}

