import { z } from "zod";

// ============================================
// Enums
// ============================================

export const UpsellTypeSchema = z.enum(["UPSELL", "DOWNSELL"]);
export const UpsellTriggerSchema = z.enum([
  "PAYMENT_SUCCESS",
  "UPSELL_REJECTED",
  "DOWNSELL_REJECTED",
]);

// ============================================
// Builder Config Schema (estrutura do checkout)
// ============================================

export const BuilderBlockSchema = z.object({
  id: z.string().uuid(),
  type: z.enum([
    "TEXT",
    "IMAGE",
    "VIDEO",
    "BENEFITS_LIST",
    "GUARANTEE_BADGE",
    "HEADER",
    "COUNTDOWN",
    "TESTIMONIAL",
    "FAQ",
    "SOCIAL_PROOF",
    "DIVIDER",
    "SPACER",
  ]),
  position: z.number().int().min(0),
  config: z.record(z.string(), z.unknown()).default({}),
});

export const BuilderConfigSchema = z.object({
  blocks: z.array(BuilderBlockSchema).default([]),
  layout: z
    .object({
      columns: z.enum(["single", "two-column"]).default("single"),
      formPosition: z.enum(["left", "right", "bottom"]).default("right"),
      showProductImage: z.boolean().default(true),
    })
    .default({
      columns: "single",
      formPosition: "right",
      showProductImage: true,
    }),
});

// ============================================
// Theme Config Schema
// ============================================

export const ThemeConfigSchema = z.object({
  primary: z.string().optional(),
  background: z.string().optional(),
  text: z.string().optional(),
  radius: z.number().int().min(0).max(64).optional(),
  fontFamily: z.string().optional(),
  logoUrl: z.string().url().optional(),
});

// ============================================
// Settings Schema (configurações extras)
// ============================================

export const CheckoutSettingsSchema = z.object({
  exitPopup: z
    .object({
      enabled: z.boolean().default(false),
      headline: z.string().optional(),
      description: z.string().optional(),
      discountPercent: z.number().min(0).max(100).optional(),
    })
    .optional(),
  countdown: z
    .object({
      enabled: z.boolean().default(false),
      duration: z.number().int().min(1).default(30), // minutos
      headline: z.string().optional(),
      expiredAction: z.enum(["hide", "redirect"]).default("hide"),
      expiredRedirectUrl: z.string().url().optional(),
    })
    .optional(),
  notifications: z
    .object({
      enabled: z.boolean().default(false),
      frequency: z.number().int().min(5).default(30), // segundos
      messages: z.array(z.string()).optional(),
    })
    .optional(),
  testimonials: z
    .array(
      z.object({
        id: z.string().uuid(),
        name: z.string(),
        photo: z.string().url().optional(),
        text: z.string(),
        rating: z.number().int().min(1).max(5).optional(),
      })
    )
    .optional(),
  guaranteeDays: z.number().int().min(0).default(7),
  paymentMethods: z
    .object({
      pix: z.boolean().default(true),
      boleto: z.boolean().default(true),
      creditCard: z.boolean().default(false),
      pixAutomatic: z.boolean().default(false),
    })
    .optional(),
});

// ============================================
// Request Schemas
// ============================================

export const CreateProductCheckoutRequestSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z
    .string()
    .min(3)
    .max(100)
    .regex(/^[a-z0-9-]+$/, "Slug deve conter apenas letras minúsculas, números e hífens"),
  isDefault: z.boolean().optional().default(false),
  builderConfig: BuilderConfigSchema.optional(),
  themeConfig: ThemeConfigSchema.optional(),
  settings: CheckoutSettingsSchema.optional(),
});

export const UpdateProductCheckoutRequestSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  slug: z
    .string()
    .min(3)
    .max(100)
    .regex(/^[a-z0-9-]+$/, "Slug deve conter apenas letras minúsculas, números e hífens")
    .optional(),
  isDefault: z.boolean().optional(),
  builderConfig: BuilderConfigSchema.optional(),
  themeConfig: ThemeConfigSchema.optional(),
  settings: CheckoutSettingsSchema.optional(),
});

export const CreateOrderBumpRequestSchema = z.object({
  courseId: z.string().uuid(),
  headline: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  amountCents: z.number().int().min(100), // mínimo R$ 1,00
  position: z.number().int().min(0).optional().default(0),
});

export const UpdateOrderBumpRequestSchema = z.object({
  headline: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional(),
  amountCents: z.number().int().min(100).optional(),
  position: z.number().int().min(0).optional(),
  active: z.boolean().optional(),
});

export const CreateUpsellOfferRequestSchema = z.object({
  type: UpsellTypeSchema,
  courseId: z.string().uuid(),
  headline: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  videoUrl: z.string().url().optional(),
  amountCents: z.number().int().min(100),
  triggerAfter: UpsellTriggerSchema,
  position: z.number().int().min(0).optional().default(0),
});

export const UpdateUpsellOfferRequestSchema = z.object({
  headline: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional(),
  videoUrl: z.string().url().optional(),
  amountCents: z.number().int().min(100).optional(),
  triggerAfter: UpsellTriggerSchema.optional(),
  position: z.number().int().min(0).optional(),
  active: z.boolean().optional(),
});

// ============================================
// Response Schemas
// ============================================

export const ProductCheckoutResponseSchema = z.object({
  id: z.string().uuid(),
  courseId: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  isDefault: z.boolean(),
  published: z.boolean(),
  builderConfig: z.record(z.string(), z.unknown()),
  themeConfig: z.record(z.string(), z.unknown()).nullable(),
  settings: z.record(z.string(), z.unknown()).nullable(),
  visits: z.number().int(),
  conversions: z.number().int(),
  conversionRate: z.number().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const ProductCheckoutListResponseSchema = z.array(ProductCheckoutResponseSchema);

export const ProductCheckoutDetailResponseSchema = ProductCheckoutResponseSchema.extend({
  orderBumps: z.array(
    z.object({
      id: z.string().uuid(),
      courseId: z.string().uuid(),
      headline: z.string(),
      description: z.string().nullable(),
      amountCents: z.number().int(),
      position: z.number().int(),
      active: z.boolean(),
      createdAt: z.string(),
    })
  ),
  upsells: z.array(
    z.object({
      id: z.string().uuid(),
      type: UpsellTypeSchema,
      courseId: z.string().uuid(),
      headline: z.string(),
      description: z.string().nullable(),
      videoUrl: z.string().nullable(),
      amountCents: z.number().int(),
      triggerAfter: UpsellTriggerSchema,
      position: z.number().int(),
      active: z.boolean(),
      createdAt: z.string(),
    })
  ),
  course: z
    .object({
      id: z.string().uuid(),
      title: z.string(),
      thumbnailUrl: z.string().nullable(),
      price: z
        .object({
          amountCents: z.number().int(),
          type: z.string(),
        })
        .nullable(),
    })
    .optional(),
});

export const OrderBumpResponseSchema = z.object({
  id: z.string().uuid(),
  checkoutId: z.string().uuid(),
  courseId: z.string().uuid(),
  headline: z.string(),
  description: z.string().nullable(),
  amountCents: z.number().int(),
  position: z.number().int(),
  active: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const UpsellOfferResponseSchema = z.object({
  id: z.string().uuid(),
  checkoutId: z.string().uuid(),
  type: UpsellTypeSchema,
  courseId: z.string().uuid(),
  headline: z.string(),
  description: z.string().nullable(),
  videoUrl: z.string().nullable(),
  amountCents: z.number().int(),
  triggerAfter: UpsellTriggerSchema,
  position: z.number().int(),
  active: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

// ============================================
// Public Checkout Response (para /c/:slug)
// ============================================

export const PublicCheckoutResponseSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  course: z.object({
    id: z.string().uuid(),
    title: z.string(),
    description: z.string().nullable(),
    thumbnailUrl: z.string().nullable(),
    price: z.object({
      amountCents: z.number().int(),
      type: z.string(),
      recurrenceInterval: z.string().nullable(),
    }),
  }),
  builderConfig: z.record(z.string(), z.unknown()),
  themeConfig: z.record(z.string(), z.unknown()).nullable(),
  settings: z.record(z.string(), z.unknown()).nullable(),
  orderBumps: z.array(
    z.object({
      id: z.string().uuid(),
      headline: z.string(),
      description: z.string().nullable(),
      amountCents: z.number().int(),
      course: z.object({
        title: z.string(),
        thumbnailUrl: z.string().nullable(),
      }),
    })
  ),
  merchant: z.object({
    name: z.string(),
    logoUrl: z.string().nullable(),
  }),
});

// ============================================
// Types
// ============================================

export type CreateProductCheckoutRequest = z.infer<typeof CreateProductCheckoutRequestSchema>;
export type UpdateProductCheckoutRequest = z.infer<typeof UpdateProductCheckoutRequestSchema>;
export type CreateOrderBumpRequest = z.infer<typeof CreateOrderBumpRequestSchema>;
export type UpdateOrderBumpRequest = z.infer<typeof UpdateOrderBumpRequestSchema>;
export type CreateUpsellOfferRequest = z.infer<typeof CreateUpsellOfferRequestSchema>;
export type UpdateUpsellOfferRequest = z.infer<typeof UpdateUpsellOfferRequestSchema>;
export type ProductCheckoutResponse = z.infer<typeof ProductCheckoutResponseSchema>;
export type ProductCheckoutDetailResponse = z.infer<typeof ProductCheckoutDetailResponseSchema>;
export type BuilderConfig = z.infer<typeof BuilderConfigSchema>;
export type ThemeConfig = z.infer<typeof ThemeConfigSchema>;
export type CheckoutSettings = z.infer<typeof CheckoutSettingsSchema>;

