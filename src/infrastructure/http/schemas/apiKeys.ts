import { z } from "zod";

export const CreateApiKeyRequestSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  permissions: z.array(z.string()).optional(),
  expiresAt: z.string().datetime().optional(),
});

export const CreateApiKeyResponseSchema = z.object({
  id: z.string().uuid(),
  merchantId: z.string().uuid(),
  rawKey: z.string(), // Mostrada apenas uma vez
  maskedKey: z.string(),
  name: z.string().nullable(),
  origin: z.enum(["DASHBOARD", "CLI", "API"]),
  permissions: z.array(z.string()),
  expiresAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});

export const ListApiKeysResponseSchema = z.object({
  apiKeys: z.array(
    z.object({
      id: z.string().uuid(),
      maskedKey: z.string(),
      name: z.string().nullable(),
      origin: z.enum(["DASHBOARD", "CLI", "API"]),
      permissions: z.array(z.string()),
      lastUsedAt: z.string().datetime().nullable(),
      expiresAt: z.string().datetime().nullable(),
      revokedAt: z.string().datetime().nullable(),
      createdAt: z.string().datetime(),
      isActive: z.boolean(),
    })
  ),
  total: z.number(),
});

export const RevokeApiKeyResponseSchema = z.object({
  id: z.string().uuid(),
  revokedAt: z.string().datetime(),
  success: z.boolean(),
});

export type CreateApiKeyRequest = z.infer<typeof CreateApiKeyRequestSchema>;
export type CreateApiKeyResponse = z.infer<typeof CreateApiKeyResponseSchema>;
export type ListApiKeysResponse = z.infer<typeof ListApiKeysResponseSchema>;
export type RevokeApiKeyResponse = z.infer<typeof RevokeApiKeyResponseSchema>;

