import { z } from "zod";

export const CreateSettlementRequestSchema = z.object({
  merchantId: z.string().uuid("merchantId must be a valid UUID"),
  amountCents: z.number().int().positive("amountCents must be a positive integer"),
  currency: z.string().length(3).default("BRL"),
  bankAccountId: z.string().uuid("bankAccountId must be a valid UUID"),
  scheduledFor: z.string().datetime().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const ProcessSettlementRequestSchema = z.object({
  settlementId: z.string().uuid("settlementId must be a valid UUID"),
});

