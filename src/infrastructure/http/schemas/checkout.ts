import { z } from "zod";

export const CreateCheckoutSessionRequestSchema = z.object({
  merchantId: z.string().uuid(),
  amountCents: z.number().int().positive(),
  currency: z.string().default("BRL"),
  description: z.string().optional(),
  expiresAt: z.string().optional(),
  externalRef: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  returnUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
});

export const CreateCheckoutSessionResponseSchema = z.object({
  id: z.string().uuid(),
  chargeId: z.string().uuid(),
  merchantId: z.string().uuid(),
  status: z.enum(["CREATED", "OPENED", "COMPLETED", "EXPIRED"]),
  url: z.string().url(),
  expiresAt: z.string().nullable(),
  createdAt: z.string(),
});

export const GetCheckoutSessionResponseSchema = z.object({
  id: z.string().uuid(),
  chargeId: z.string().uuid(),
  merchantId: z.string().uuid(),
  status: z.enum(["CREATED", "OPENED", "COMPLETED", "EXPIRED"]),
  amountCents: z.number().int(),
  currency: z.string(),
  description: z.string().nullable(),
  pix: z
    .object({ qrCode: z.string(), copyPaste: z.string(), expiresAt: z.string() })
    .optional(),
  boleto: z
    .object({ boletoUrl: z.string().url(), expiresAt: z.string() })
    .optional(),
  theme: z
    .object({
      logoUrl: z.string().url().nullable().optional(),
      themeTokens: z.record(z.string(), z.unknown()).nullable().optional(),
      animations: z.boolean().optional(),
    })
    .nullable()
    .optional(),
  expiresAt: z.string().nullable(),
  createdAt: z.string(),
});

export const UpdateCheckoutConfigRequestSchema = z.object({
  merchantId: z.string().uuid(),
  logoUrl: z.string().url().nullable().optional(),
  themeTokens: z
    .object({
      primary: z.string().optional(),
      background: z.string().optional(),
      surface: z.string().optional(),
      text: z.string().optional(),
      success: z.string().optional(),
      warning: z.string().optional(),
      danger: z.string().optional(),
      radius: z.number().int().optional(),
      fontFamily: z.string().optional(),
    })
    .nullable()
    .optional(),
  animations: z.boolean().optional(),
});

export const CheckoutConfigResponseSchema = z.object({
  merchantId: z.string().uuid(),
  logoUrl: z.string().url().nullable(),
  themeTokens: z.record(z.string(), z.unknown()).nullable(),
  animations: z.boolean(),
  updatedAt: z.string(),
});
