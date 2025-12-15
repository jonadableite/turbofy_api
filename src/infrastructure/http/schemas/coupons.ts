import { z } from "zod";
import { DiscountType } from "../../../domain/entities/Coupon";

/**
 * @security Validates all coupon input data
 * @performance Lightweight validation schemas
 * @maintainability Centralized validation logic
 * @testability Schemas can be tested independently
 */

// Create Coupon Request
export const CreateCouponRequestSchema = z.object({
  courseId: z.string().uuid("courseId deve ser um UUID válido"),
  code: z
    .string()
    .min(1, "Código é obrigatório")
    .max(50, "Código deve ter no máximo 50 caracteres")
    .regex(/^[A-Za-z0-9_-]+$/, "Código deve conter apenas letras, números, hífen e underscore")
    .transform((val) => val.toUpperCase()),
  description: z.string().max(500, "Descrição deve ter no máximo 500 caracteres").optional(),
  discountType: z.nativeEnum(DiscountType),
  percentage: z
    .number()
    .int("Percentual deve ser um número inteiro")
    .min(1, "Percentual mínimo é 1%")
    .max(100, "Percentual máximo é 100%")
    .optional(),
  amountCents: z
    .number()
    .int("Valor deve ser um número inteiro")
    .min(1, "Valor mínimo é 1 centavo")
    .optional(),
  maxRedemptions: z
    .number()
    .int("Quantidade deve ser um número inteiro")
    .min(0, "Quantidade não pode ser negativa")
    .optional(),
  expiresAt: z.string().datetime().optional().transform((val) => val ? new Date(val) : undefined),
}).refine(
  (data) => {
    if (data.discountType === DiscountType.PERCENTAGE) {
      return data.percentage !== undefined;
    }
    return true;
  },
  {
    message: "Percentual é obrigatório para cupons de porcentagem",
    path: ["percentage"],
  }
).refine(
  (data) => {
    if (data.discountType === DiscountType.FIXED) {
      return data.amountCents !== undefined;
    }
    return true;
  },
  {
    message: "Valor é obrigatório para cupons de valor fixo",
    path: ["amountCents"],
  }
);

// Update Coupon Request
export const UpdateCouponRequestSchema = z.object({
  description: z.string().max(500).optional(),
  percentage: z.number().int().min(1).max(100).optional(),
  amountCents: z.number().int().min(1).optional(),
  maxRedemptions: z.number().int().min(0).optional(),
  expiresAt: z.string().datetime().optional().transform((val) => val ? new Date(val) : undefined),
  active: z.boolean().optional(),
});

// Validate Coupon Request
export const ValidateCouponRequestSchema = z.object({
  code: z.string().min(1, "Código é obrigatório").transform((val) => val.toUpperCase()),
  courseId: z.string().uuid().optional(),
  originalAmountCents: z.number().int().min(0),
});

// List Coupons Query
export const ListCouponsQuerySchema = z.object({
  courseId: z.string().uuid().optional(),
  active: z.enum(["true", "false"]).optional().transform((val) => val === "true" ? true : val === "false" ? false : undefined),
  search: z.string().optional(),
  limit: z.string().optional().transform((val) => val ? parseInt(val, 10) : 50),
  offset: z.string().optional().transform((val) => val ? parseInt(val, 10) : 0),
});

// Coupon Response
export const CouponResponseSchema = z.object({
  id: z.string().uuid(),
  merchantId: z.string().uuid(),
  courseId: z.string().uuid().optional(),
  code: z.string(),
  description: z.string().nullable(),
  discountType: z.nativeEnum(DiscountType),
  percentage: z.number().nullable(),
  amountCents: z.number().nullable(),
  maxRedemptions: z.number().nullable(),
  redemptions: z.number(),
  expiresAt: z.string().nullable(),
  active: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const CouponListResponseSchema = z.object({
  coupons: z.array(CouponResponseSchema),
  stats: z.object({
    totalDiscountCents: z.number(),
    totalRedemptions: z.number(),
    activeCoupons: z.number(),
  }),
  total: z.number(),
});

export const ValidateCouponResponseSchema = z.object({
  valid: z.boolean(),
  coupon: z.object({
    id: z.string().uuid(),
    code: z.string(),
    discountType: z.string(),
    percentage: z.number().optional(),
    amountCents: z.number().optional(),
    discountAmountCents: z.number(),
    finalAmountCents: z.number(),
  }).optional(),
  error: z.string().optional(),
});

// Type exports
export type CreateCouponRequest = z.infer<typeof CreateCouponRequestSchema>;
export type UpdateCouponRequest = z.infer<typeof UpdateCouponRequestSchema>;
export type ValidateCouponRequest = z.infer<typeof ValidateCouponRequestSchema>;
export type ListCouponsQuery = z.infer<typeof ListCouponsQuerySchema>;
export type CouponResponse = z.infer<typeof CouponResponseSchema>;
export type CouponListResponse = z.infer<typeof CouponListResponseSchema>;
export type ValidateCouponResponse = z.infer<typeof ValidateCouponResponseSchema>;

