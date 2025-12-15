import { prisma } from "./prismaClient";
import { WebhookAttemptRecord, WebhookAttemptRepository } from "../../ports/WebhookAttemptRepository";

export class PrismaWebhookAttemptRepository implements WebhookAttemptRepository {
  async record(attempt: WebhookAttemptRecord): Promise<void> {
    await prisma.webhookAttempt.create({
      data: {
        provider: attempt.provider,
        type: attempt.type,
        eventId: attempt.eventId,
        status: attempt.status,
        attempt: attempt.attempt,
        signatureValid: attempt.signatureValid,
        errorMessage: attempt.errorMessage ?? null,
        payload: attempt.payload as any,
      },
    });
  }
}
