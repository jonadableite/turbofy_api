/**
 * Rotas para gerenciamento de DomainConfig (personalização da área de membros)
 * 
 * @security Validação de entrada com Zod
 * @maintainability Separação de concerns
 */

import { Router, Request, Response } from "express";
import { ZodError } from "zod";
import { authMiddleware } from "../middlewares/authMiddleware";
import { logger } from "../../logger";
import { z } from "zod";
import { UpsertDomainConfig } from "../../../application/useCases/UpsertDomainConfig";
import { PrismaDomainConfigRepository } from "../../database/repositories/PrismaDomainConfigRepository";
import rateLimit from "express-rate-limit";
import { ensureMerchantId } from "../utils/ensureMerchantId";

type AuthenticatedRequest = Request & {
  user?: {
    id: string;
    merchantId?: string | null;
  };
};

export const domainConfigRouter = Router();

const isDevelopment = process.env.NODE_ENV === "development";
const domainConfigLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minuto
  max: isDevelopment ? 100 : 30,
  message: "Too many requests, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    if (isDevelopment) {
      const ip = req.ip || req.socket.remoteAddress || "";
      return ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
    }
    return false;
  },
});

const UpsertDomainConfigSchema = z.object({
  schoolName: z.string().min(1).max(100).optional(),
  logoUrl: z.string().url().nullable().optional(),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  customDomain: z.string().regex(/^([a-z0-9]+(-[a-z0-9]+)*\.)+[a-z]{2,}$/i).nullable().optional(),
  bannerUrl: z.string().url().nullable().optional(),
  faviconUrl: z.string().url().nullable().optional(),
  secondaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).nullable().optional(),
  accentColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).nullable().optional(),
  fontFamily: z.string().max(100).nullable().optional(),
  theme: z.enum(["dark", "light"]).nullable().optional(),
});

/**
 * GET /domain-config
 * Obtém configuração de domínio do merchant autenticado
 */
domainConfigRouter.get("/", authMiddleware, domainConfigLimiter, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        error: {
          code: "UNAUTHORIZED",
          message: "User not authenticated",
        },
      });
    }

    const merchantId = req.user?.merchantId ?? (await ensureMerchantId(userId));

    const repository = new PrismaDomainConfigRepository();
    const config = await repository.findByMerchantId(merchantId);

    if (!config) {
      // Retornar configuração padrão se não existir
      return res.status(200).json({
        id: "",
        merchantId,
        schoolName: "Minha Escola",
        logoUrl: null,
        primaryColor: "#8B5CF6",
        customDomain: null,
        bannerUrl: null,
        faviconUrl: null,
        secondaryColor: null,
        accentColor: null,
        fontFamily: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    return res.status(200).json({
      id: config.id,
      merchantId: config.merchantId,
      schoolName: config.schoolName,
      logoUrl: config.logoUrl ?? null,
      primaryColor: config.primaryColor,
      customDomain: config.customDomain ?? null,
      bannerUrl: config.bannerUrl ?? null,
      faviconUrl: config.faviconUrl ?? null,
        secondaryColor: config.secondaryColor ?? null,
        accentColor: config.accentColor ?? null,
        fontFamily: config.fontFamily ?? null,
        theme: config.theme ?? "dark",
        createdAt: config.createdAt.toISOString(),
        updatedAt: config.updatedAt.toISOString(),
      });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logger.error({ error: errorMessage }, "Error getting domain config");

    // Fallback seguro: retornar configuração padrão para não bloquear UI
    try {
      const userId = req.user?.id;
      const merchantId = userId ? (req.user?.merchantId ?? (await ensureMerchantId(userId))) : "";
      return res.status(200).json({
        id: "",
        merchantId,
        schoolName: "Minha Escola",
        logoUrl: null,
        primaryColor: "#8B5CF6",
        customDomain: null,
        bannerUrl: null,
        faviconUrl: null,
        secondaryColor: null,
        accentColor: null,
        fontFamily: null,
        theme: "dark",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      logger.error({ error: msg }, "Fallback default domain config failed");
      return res.status(500).json({
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to get domain config",
        },
      });
    }
  }
});

/**
 * PUT /domain-config
 * Cria ou atualiza configuração de domínio
 */
domainConfigRouter.put("/", authMiddleware, domainConfigLimiter, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        error: {
          code: "UNAUTHORIZED",
          message: "User not authenticated",
        },
      });
    }

    const merchantId = req.user?.merchantId ?? (await ensureMerchantId(userId));

    const parsed = UpsertDomainConfigSchema.parse(req.body);

    const repository = new PrismaDomainConfigRepository();
    const useCase = new UpsertDomainConfig(repository);

    const { config } = await useCase.execute({
      merchantId,
      ...parsed,
    });

    return res.status(200).json({
      id: config.id,
      merchantId: config.merchantId,
      schoolName: config.schoolName,
      logoUrl: config.logoUrl ?? null,
      primaryColor: config.primaryColor,
      customDomain: config.customDomain ?? null,
      bannerUrl: config.bannerUrl ?? null,
      faviconUrl: config.faviconUrl ?? null,
        secondaryColor: config.secondaryColor ?? null,
        accentColor: config.accentColor ?? null,
        fontFamily: config.fontFamily ?? null,
        theme: config.theme ?? "dark",
        createdAt: config.createdAt.toISOString(),
        updatedAt: config.updatedAt.toISOString(),
      });
    } catch (error: unknown) {
      if (error instanceof ZodError) {
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid input data",
          details: error.issues,
        },
      });
    }

    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logger.error({ error: errorMessage }, "Error upserting domain config");

    if (errorMessage.includes("must be a valid")) {
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: errorMessage,
        },
      });
    }

    return res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "Failed to upsert domain config",
      },
    });
  }
});

