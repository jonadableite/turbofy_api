import { z } from "zod";
import { ChargeMethod, ChargeStatus } from "../../../domain/entities/Charge";

export const ChargeMethodSchema = z.nativeEnum(ChargeMethod);

export const ChargeStatusSchema = z.nativeEnum(ChargeStatus);

const SplitSchema = z.object({
  merchantId: z.string().uuid({ message: "merchantId must be a valid UUID" }),
  amountCents: z.number().int().positive().optional(),
  percentage: z.number().min(0).max(100).optional(),
}).refine(
  (data) => data.amountCents !== undefined || data.percentage !== undefined,
  {
    message: "Either amountCents or percentage must be provided",
  }
);

const FeeSchema = z.object({
  type: z.string().min(1, "Fee type is required"),
  amountCents: z.number().int().nonnegative("amountCents must be non-negative"),
});

export const CreateChargeRequestSchema = z.object({
  merchantId: z.string().uuid({ message: "merchantId inválido (UUID v4)" }),
  amountCents: z.number().int().min(500, "Valor mínimo é R$ 5,00 (500 centavos)"),
  currency: z.literal("BRL").optional().default("BRL"),
  description: z.string().max(255).optional(),
  method: ChargeMethodSchema.optional(),
  expiresAt: z.string().datetime().optional(),
  idempotencyKey: z.string().min(8),
  externalRef: z.string().max(128).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  splits: z.array(SplitSchema).optional(),
  fees: z.array(FeeSchema).optional(),
});

export const PixPayloadSchema = z.object({
  qrCode: z.string(),
  copyPaste: z.string(),
  expiresAt: z.string().datetime(),
});

export const BoletoPayloadSchema = z.object({
  boletoUrl: z.string(),
  expiresAt: z.string().datetime(),
});

export const CreateChargeResponseSchema = z.object({
  id: z.string().uuid(),
  merchantId: z.string().uuid(),
  amountCents: z.number().int(),
  currency: z.literal("BRL"),
  description: z.string().nullable().optional(),
  status: ChargeStatusSchema,
  method: ChargeMethodSchema.nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  idempotencyKey: z.string(),
  externalRef: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  pix: PixPayloadSchema.optional(),
  boleto: BoletoPayloadSchema.optional(),
  splits: z.array(z.object({
    id: z.string().uuid(),
    merchantId: z.string().uuid(),
    amountCents: z.number().int(),
    percentage: z.number().optional(),
  })).optional(),
  fees: z.array(z.object({
    id: z.string().uuid(),
    type: z.string(),
    amountCents: z.number().int(),
  })).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const ErrorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
});

export type CreateChargeRequest = z.infer<typeof CreateChargeRequestSchema>;
export type CreateChargeResponse = z.infer<typeof CreateChargeResponseSchema>;