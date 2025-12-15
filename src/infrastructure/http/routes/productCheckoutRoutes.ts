import { Router, Request, Response } from "express";
import { ZodError } from "zod";
import { authMiddleware } from "../middlewares/authMiddleware";
import { logger } from "../../logger";
import { PrismaProductCheckoutRepository } from "../../database/repositories/PrismaProductCheckoutRepository";
import { PrismaCourseRepository } from "../../database/repositories/PrismaCourseRepository";
import {
  CreateProductCheckoutRequestSchema,
  UpdateProductCheckoutRequestSchema,
  CreateOrderBumpRequestSchema,
  UpdateOrderBumpRequestSchema,
  CreateUpsellOfferRequestSchema,
  UpdateUpsellOfferRequestSchema,
  ProductCheckoutResponseSchema,
  ProductCheckoutListResponseSchema,
  ProductCheckoutDetailResponseSchema,
  OrderBumpResponseSchema,
  UpsellOfferResponseSchema,
  PublicCheckoutResponseSchema,
} from "../schemas/productCheckout";
import { ensureMerchantId } from "../utils/ensureMerchantId";
import rateLimit from "express-rate-limit";
import { UpsellType, UpsellTrigger } from "@prisma/client";
import { ProcessCheckoutPayment } from "../../../application/useCases/ProcessCheckoutPayment";
import { z } from "zod";

export const productCheckoutRouter = Router();

// Rate limiter
const isDevelopment = process.env.NODE_ENV === "development";
const checkoutLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: isDevelopment ? 200 : 50,
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

// Helper: calcular taxa de conversão
const calculateConversionRate = (visits: number, conversions: number): number => {
  if (visits === 0) return 0;
  return Math.round((conversions / visits) * 10000) / 100; // 2 casas decimais
};

// Helper: formatar checkout para resposta
const checkoutToResponse = (checkout: any) => ({
  id: checkout.id,
  courseId: checkout.courseId,
  name: checkout.name,
  slug: checkout.slug,
  isDefault: checkout.isDefault,
  published: checkout.published,
  builderConfig: checkout.builderConfig,
  themeConfig: checkout.themeConfig,
  settings: checkout.settings,
  visits: checkout.visits,
  conversions: checkout.conversions,
  conversionRate: calculateConversionRate(checkout.visits, checkout.conversions),
  createdAt: checkout.createdAt.toISOString(),
  updatedAt: checkout.updatedAt.toISOString(),
});

// ============================================
// ProductCheckout Routes
// ============================================

/**
 * GET /product-checkouts
 * Listar todos os checkouts do merchant autenticado
 */
productCheckoutRouter.get(
  "/",
  checkoutLimiter,
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: { code: "UNAUTHORIZED", message: "Usuário não autenticado" },
        });
      }

      const merchantId = await ensureMerchantId(req.user.id);

      const checkoutRepository = new PrismaProductCheckoutRepository();
      const checkouts = await checkoutRepository.findByMerchantId(merchantId);

      const response = checkouts.map((checkout) => ({
        ...checkoutToResponse(checkout),
        course: checkout.course
          ? {
              id: checkout.course.id,
              title: checkout.course.title,
              thumbnailUrl: checkout.course.thumbnailUrl,
            }
          : undefined,
      }));

      res.json(response);
    } catch (err) {
      logger.error({ err }, "Erro ao listar checkouts do merchant");
      res.status(500).json({
        error: { code: "INTERNAL_ERROR", message: "Erro interno" },
      });
    }
  }
);

/**
 * GET /courses/:courseId/checkouts
 * Listar checkouts do curso
 */
productCheckoutRouter.get(
  "/courses/:courseId/checkouts",
  checkoutLimiter,
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: { code: "UNAUTHORIZED", message: "Usuário não autenticado" },
        });
      }

      const merchantId = await ensureMerchantId(req.user.id);
      const courseId = req.params.courseId;

      // Verificar se o curso pertence ao merchant
      const courseRepository = new PrismaCourseRepository();
      const course = await courseRepository.findById(courseId);

      if (!course) {
        return res.status(404).json({
          error: { code: "COURSE_NOT_FOUND", message: "Curso não encontrado" },
        });
      }

      if (course.merchantId !== merchantId) {
        return res.status(403).json({
          error: { code: "FORBIDDEN", message: "Acesso negado" },
        });
      }

      const checkoutRepository = new PrismaProductCheckoutRepository();
      const checkouts = await checkoutRepository.findByCourseId(courseId);

      const response = checkouts.map(checkoutToResponse);
      const validated = ProductCheckoutListResponseSchema.parse(response);

      res.json(validated);
    } catch (err) {
      logger.error({ err }, "Erro ao listar checkouts");
      res.status(500).json({
        error: { code: "INTERNAL_ERROR", message: "Erro interno" },
      });
    }
  }
);

/**
 * POST /courses/:courseId/checkouts
 * Criar novo checkout
 */
productCheckoutRouter.post(
  "/courses/:courseId/checkouts",
  checkoutLimiter,
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: { code: "UNAUTHORIZED", message: "Usuário não autenticado" },
        });
      }

      const merchantId = await ensureMerchantId(req.user.id);
      const courseId = req.params.courseId;
      const parsed = CreateProductCheckoutRequestSchema.parse(req.body);

      // Verificar se o curso pertence ao merchant
      const courseRepository = new PrismaCourseRepository();
      const course = await courseRepository.findById(courseId);

      if (!course) {
        return res.status(404).json({
          error: { code: "COURSE_NOT_FOUND", message: "Curso não encontrado" },
        });
      }

      if (course.merchantId !== merchantId) {
        return res.status(403).json({
          error: { code: "FORBIDDEN", message: "Acesso negado" },
        });
      }

      const checkoutRepository = new PrismaProductCheckoutRepository();

      // Verificar se o slug já existe
      if (await checkoutRepository.slugExists(parsed.slug)) {
        return res.status(409).json({
          error: { code: "SLUG_EXISTS", message: "Slug já está em uso" },
        });
      }

      const checkout = await checkoutRepository.create({
        courseId,
        name: parsed.name,
        slug: parsed.slug,
        isDefault: parsed.isDefault,
        builderConfig: parsed.builderConfig as any,
        themeConfig: parsed.themeConfig as any,
        settings: parsed.settings as any,
      });

      const response = checkoutToResponse(checkout);
      const validated = ProductCheckoutResponseSchema.parse(response);

      res.status(201).json(validated);
    } catch (err) {
      if (err instanceof ZodError) {
        return res.status(400).json({
          error: { code: "VALIDATION_ERROR", message: "Dados inválidos", details: err.issues },
        });
      }
      logger.error({ err }, "Erro ao criar checkout");
      res.status(500).json({
        error: { code: "INTERNAL_ERROR", message: "Erro interno" },
      });
    }
  }
);

/**
 * GET /checkouts/:id
 * Detalhes do checkout com order bumps e upsells
 */
productCheckoutRouter.get(
  "/checkouts/:id",
  checkoutLimiter,
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: { code: "UNAUTHORIZED", message: "Usuário não autenticado" },
        });
      }

      const merchantId = await ensureMerchantId(req.user.id);
      const checkoutId = req.params.id;

      const checkoutRepository = new PrismaProductCheckoutRepository();
      const checkout = await checkoutRepository.findById(checkoutId);

      if (!checkout) {
        return res.status(404).json({
          error: { code: "CHECKOUT_NOT_FOUND", message: "Checkout não encontrado" },
        });
      }

      if (checkout.course?.merchantId !== merchantId) {
        return res.status(403).json({
          error: { code: "FORBIDDEN", message: "Acesso negado" },
        });
      }

      const response = {
        ...checkoutToResponse(checkout),
        orderBumps: checkout.orderBumps.map((ob) => ({
          id: ob.id,
          courseId: ob.courseId,
          headline: ob.headline,
          description: ob.description,
          amountCents: ob.amountCents,
          position: ob.position,
          active: ob.active,
          createdAt: ob.createdAt.toISOString(),
        })),
        upsells: checkout.upsells.map((up) => ({
          id: up.id,
          type: up.type,
          courseId: up.courseId,
          headline: up.headline,
          description: up.description,
          videoUrl: up.videoUrl,
          amountCents: up.amountCents,
          triggerAfter: up.triggerAfter,
          position: up.position,
          active: up.active,
          createdAt: up.createdAt.toISOString(),
        })),
        course: checkout.course
          ? {
              id: checkout.course.id,
              title: checkout.course.title,
              thumbnailUrl: checkout.course.thumbnailUrl,
              price: checkout.course.prices[0]
                ? {
                    amountCents: checkout.course.prices[0].amountCents,
                    type: checkout.course.prices[0].type,
                  }
                : null,
            }
          : undefined,
      };

      const validated = ProductCheckoutDetailResponseSchema.parse(response);
      res.json(validated);
    } catch (err) {
      logger.error({ err }, "Erro ao buscar checkout");
      res.status(500).json({
        error: { code: "INTERNAL_ERROR", message: "Erro interno" },
      });
    }
  }
);

/**
 * PUT /checkouts/:id
 * Atualizar checkout
 */
productCheckoutRouter.put(
  "/checkouts/:id",
  checkoutLimiter,
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: { code: "UNAUTHORIZED", message: "Usuário não autenticado" },
        });
      }

      const merchantId = await ensureMerchantId(req.user.id);
      const checkoutId = req.params.id;
      const parsed = UpdateProductCheckoutRequestSchema.parse(req.body);

      const checkoutRepository = new PrismaProductCheckoutRepository();
      const existing = await checkoutRepository.findById(checkoutId);

      if (!existing) {
        return res.status(404).json({
          error: { code: "CHECKOUT_NOT_FOUND", message: "Checkout não encontrado" },
        });
      }

      if (existing.course?.merchantId !== merchantId) {
        return res.status(403).json({
          error: { code: "FORBIDDEN", message: "Acesso negado" },
        });
      }

      // Verificar se o slug já existe (se estiver sendo alterado)
      if (parsed.slug && parsed.slug !== existing.slug) {
        if (await checkoutRepository.slugExists(parsed.slug, checkoutId)) {
          return res.status(409).json({
            error: { code: "SLUG_EXISTS", message: "Slug já está em uso" },
          });
        }
      }

      const checkout = await checkoutRepository.update(checkoutId, {
        name: parsed.name,
        slug: parsed.slug,
        isDefault: parsed.isDefault,
        builderConfig: parsed.builderConfig as any,
        themeConfig: parsed.themeConfig as any,
        settings: parsed.settings as any,
      });

      const response = checkoutToResponse(checkout);
      const validated = ProductCheckoutResponseSchema.parse(response);

      res.json(validated);
    } catch (err) {
      if (err instanceof ZodError) {
        return res.status(400).json({
          error: { code: "VALIDATION_ERROR", message: "Dados inválidos", details: err.issues },
        });
      }
      logger.error({ err }, "Erro ao atualizar checkout");
      res.status(500).json({
        error: { code: "INTERNAL_ERROR", message: "Erro interno" },
      });
    }
  }
);

/**
 * DELETE /checkouts/:id
 * Excluir checkout
 */
productCheckoutRouter.delete(
  "/checkouts/:id",
  checkoutLimiter,
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: { code: "UNAUTHORIZED", message: "Usuário não autenticado" },
        });
      }

      const merchantId = await ensureMerchantId(req.user.id);
      const checkoutId = req.params.id;

      const checkoutRepository = new PrismaProductCheckoutRepository();
      const existing = await checkoutRepository.findById(checkoutId);

      if (!existing) {
        return res.status(404).json({
          error: { code: "CHECKOUT_NOT_FOUND", message: "Checkout não encontrado" },
        });
      }

      if (existing.course?.merchantId !== merchantId) {
        return res.status(403).json({
          error: { code: "FORBIDDEN", message: "Acesso negado" },
        });
      }

      // Não permitir deletar o checkout padrão se for o único
      if (existing.isDefault) {
        const courseCheckouts = await checkoutRepository.findByCourseId(existing.courseId);
        if (courseCheckouts.length === 1) {
          return res.status(400).json({
            error: {
              code: "CANNOT_DELETE_DEFAULT",
              message: "Não é possível excluir o único checkout do curso",
            },
          });
        }
      }

      await checkoutRepository.delete(checkoutId);

      res.status(204).send();
    } catch (err) {
      logger.error({ err }, "Erro ao excluir checkout");
      res.status(500).json({
        error: { code: "INTERNAL_ERROR", message: "Erro interno" },
      });
    }
  }
);

/**
 * POST /checkouts/:id/duplicate
 * Duplicar checkout
 */
productCheckoutRouter.post(
  "/checkouts/:id/duplicate",
  checkoutLimiter,
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: { code: "UNAUTHORIZED", message: "Usuário não autenticado" },
        });
      }

      const merchantId = await ensureMerchantId(req.user.id);
      const checkoutId = req.params.id;

      const checkoutRepository = new PrismaProductCheckoutRepository();
      const existing = await checkoutRepository.findById(checkoutId);

      if (!existing) {
        return res.status(404).json({
          error: { code: "CHECKOUT_NOT_FOUND", message: "Checkout não encontrado" },
        });
      }

      if (existing.course?.merchantId !== merchantId) {
        return res.status(403).json({
          error: { code: "FORBIDDEN", message: "Acesso negado" },
        });
      }

      // Gerar nome e slug únicos
      const timestamp = Date.now();
      const newName = `${existing.name} (Cópia)`;
      const newSlug = `${existing.slug}-copy-${timestamp}`;

      const checkout = await checkoutRepository.duplicate(checkoutId, newName, newSlug);

      const response = checkoutToResponse(checkout);
      const validated = ProductCheckoutResponseSchema.parse(response);

      res.status(201).json(validated);
    } catch (err) {
      logger.error({ err }, "Erro ao duplicar checkout");
      res.status(500).json({
        error: { code: "INTERNAL_ERROR", message: "Erro interno" },
      });
    }
  }
);

/**
 * PATCH /checkouts/:id/publish
 * Publicar/despublicar checkout
 */
productCheckoutRouter.patch(
  "/checkouts/:id/publish",
  checkoutLimiter,
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: { code: "UNAUTHORIZED", message: "Usuário não autenticado" },
        });
      }

      const merchantId = await ensureMerchantId(req.user.id);
      const checkoutId = req.params.id;
      const { published } = req.body;

      if (typeof published !== "boolean") {
        return res.status(400).json({
          error: { code: "VALIDATION_ERROR", message: "Campo 'published' é obrigatório (boolean)" },
        });
      }

      const checkoutRepository = new PrismaProductCheckoutRepository();
      const existing = await checkoutRepository.findById(checkoutId);

      if (!existing) {
        return res.status(404).json({
          error: { code: "CHECKOUT_NOT_FOUND", message: "Checkout não encontrado" },
        });
      }

      if (existing.course?.merchantId !== merchantId) {
        return res.status(403).json({
          error: { code: "FORBIDDEN", message: "Acesso negado" },
        });
      }

      const checkout = await checkoutRepository.update(checkoutId, { published });

      const response = checkoutToResponse(checkout);
      const validated = ProductCheckoutResponseSchema.parse(response);

      res.json(validated);
    } catch (err) {
      logger.error({ err }, "Erro ao publicar checkout");
      res.status(500).json({
        error: { code: "INTERNAL_ERROR", message: "Erro interno" },
      });
    }
  }
);

// ============================================
// OrderBump Routes
// ============================================

/**
 * GET /checkouts/:id/order-bumps
 * Listar order bumps do checkout
 */
productCheckoutRouter.get(
  "/checkouts/:id/order-bumps",
  checkoutLimiter,
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: { code: "UNAUTHORIZED", message: "Usuário não autenticado" },
        });
      }

      const merchantId = await ensureMerchantId(req.user.id);
      const checkoutId = req.params.id;

      const checkoutRepository = new PrismaProductCheckoutRepository();
      const checkout = await checkoutRepository.findById(checkoutId);

      if (!checkout) {
        return res.status(404).json({
          error: { code: "CHECKOUT_NOT_FOUND", message: "Checkout não encontrado" },
        });
      }

      if (checkout.course?.merchantId !== merchantId) {
        return res.status(403).json({
          error: { code: "FORBIDDEN", message: "Acesso negado" },
        });
      }

      const orderBumps = await checkoutRepository.findOrderBumpsByCheckoutId(checkoutId);

      const response = orderBumps.map((ob) => ({
        id: ob.id,
        checkoutId: ob.checkoutId,
        courseId: ob.courseId,
        headline: ob.headline,
        description: ob.description,
        amountCents: ob.amountCents,
        position: ob.position,
        active: ob.active,
        createdAt: ob.createdAt.toISOString(),
        updatedAt: ob.updatedAt.toISOString(),
      }));

      res.json(response);
    } catch (err) {
      logger.error({ err }, "Erro ao listar order bumps");
      res.status(500).json({
        error: { code: "INTERNAL_ERROR", message: "Erro interno" },
      });
    }
  }
);

/**
 * POST /checkouts/:id/order-bumps
 * Criar order bump
 */
productCheckoutRouter.post(
  "/checkouts/:id/order-bumps",
  checkoutLimiter,
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: { code: "UNAUTHORIZED", message: "Usuário não autenticado" },
        });
      }

      const merchantId = await ensureMerchantId(req.user.id);
      const checkoutId = req.params.id;
      const parsed = CreateOrderBumpRequestSchema.parse(req.body);

      const checkoutRepository = new PrismaProductCheckoutRepository();
      const checkout = await checkoutRepository.findById(checkoutId);

      if (!checkout) {
        return res.status(404).json({
          error: { code: "CHECKOUT_NOT_FOUND", message: "Checkout não encontrado" },
        });
      }

      if (checkout.course?.merchantId !== merchantId) {
        return res.status(403).json({
          error: { code: "FORBIDDEN", message: "Acesso negado" },
        });
      }

      // Verificar se o curso do bump pertence ao merchant
      const courseRepository = new PrismaCourseRepository();
      const bumpCourse = await courseRepository.findById(parsed.courseId);

      if (!bumpCourse || bumpCourse.merchantId !== merchantId) {
        return res.status(400).json({
          error: { code: "INVALID_COURSE", message: "Curso do order bump inválido" },
        });
      }

      const orderBump = await checkoutRepository.createOrderBump({
        checkoutId,
        courseId: parsed.courseId,
        headline: parsed.headline,
        description: parsed.description,
        amountCents: parsed.amountCents,
        position: parsed.position,
      });

      const response = {
        id: orderBump.id,
        checkoutId: orderBump.checkoutId,
        courseId: orderBump.courseId,
        headline: orderBump.headline,
        description: orderBump.description,
        amountCents: orderBump.amountCents,
        position: orderBump.position,
        active: orderBump.active,
        createdAt: orderBump.createdAt.toISOString(),
        updatedAt: orderBump.updatedAt.toISOString(),
      };

      const validated = OrderBumpResponseSchema.parse(response);
      res.status(201).json(validated);
    } catch (err) {
      if (err instanceof ZodError) {
        return res.status(400).json({
          error: { code: "VALIDATION_ERROR", message: "Dados inválidos", details: err.issues },
        });
      }
      logger.error({ err }, "Erro ao criar order bump");
      res.status(500).json({
        error: { code: "INTERNAL_ERROR", message: "Erro interno" },
      });
    }
  }
);

/**
 * PUT /order-bumps/:id
 * Atualizar order bump
 */
productCheckoutRouter.put(
  "/order-bumps/:id",
  checkoutLimiter,
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: { code: "UNAUTHORIZED", message: "Usuário não autenticado" },
        });
      }

      const merchantId = await ensureMerchantId(req.user.id);
      const orderBumpId = req.params.id;
      const parsed = UpdateOrderBumpRequestSchema.parse(req.body);

      const checkoutRepository = new PrismaProductCheckoutRepository();
      const orderBump = await checkoutRepository.findOrderBumpById(orderBumpId);

      if (!orderBump) {
        return res.status(404).json({
          error: { code: "ORDER_BUMP_NOT_FOUND", message: "Order bump não encontrado" },
        });
      }

      // Verificar acesso via checkout
      const checkout = await checkoutRepository.findById(orderBump.checkoutId);
      if (!checkout || checkout.course?.merchantId !== merchantId) {
        return res.status(403).json({
          error: { code: "FORBIDDEN", message: "Acesso negado" },
        });
      }

      const updated = await checkoutRepository.updateOrderBump(orderBumpId, parsed);

      const response = {
        id: updated.id,
        checkoutId: updated.checkoutId,
        courseId: updated.courseId,
        headline: updated.headline,
        description: updated.description,
        amountCents: updated.amountCents,
        position: updated.position,
        active: updated.active,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      };

      const validated = OrderBumpResponseSchema.parse(response);
      res.json(validated);
    } catch (err) {
      if (err instanceof ZodError) {
        return res.status(400).json({
          error: { code: "VALIDATION_ERROR", message: "Dados inválidos", details: err.issues },
        });
      }
      logger.error({ err }, "Erro ao atualizar order bump");
      res.status(500).json({
        error: { code: "INTERNAL_ERROR", message: "Erro interno" },
      });
    }
  }
);

/**
 * DELETE /order-bumps/:id
 * Excluir order bump
 */
productCheckoutRouter.delete(
  "/order-bumps/:id",
  checkoutLimiter,
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: { code: "UNAUTHORIZED", message: "Usuário não autenticado" },
        });
      }

      const merchantId = await ensureMerchantId(req.user.id);
      const orderBumpId = req.params.id;

      const checkoutRepository = new PrismaProductCheckoutRepository();
      const orderBump = await checkoutRepository.findOrderBumpById(orderBumpId);

      if (!orderBump) {
        return res.status(404).json({
          error: { code: "ORDER_BUMP_NOT_FOUND", message: "Order bump não encontrado" },
        });
      }

      const checkout = await checkoutRepository.findById(orderBump.checkoutId);
      if (!checkout || checkout.course?.merchantId !== merchantId) {
        return res.status(403).json({
          error: { code: "FORBIDDEN", message: "Acesso negado" },
        });
      }

      await checkoutRepository.deleteOrderBump(orderBumpId);

      res.status(204).send();
    } catch (err) {
      logger.error({ err }, "Erro ao excluir order bump");
      res.status(500).json({
        error: { code: "INTERNAL_ERROR", message: "Erro interno" },
      });
    }
  }
);

// ============================================
// UpsellOffer Routes
// ============================================

/**
 * GET /checkouts/:id/upsells
 * Listar upsells do checkout
 */
productCheckoutRouter.get(
  "/checkouts/:id/upsells",
  checkoutLimiter,
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: { code: "UNAUTHORIZED", message: "Usuário não autenticado" },
        });
      }

      const merchantId = await ensureMerchantId(req.user.id);
      const checkoutId = req.params.id;

      const checkoutRepository = new PrismaProductCheckoutRepository();
      const checkout = await checkoutRepository.findById(checkoutId);

      if (!checkout) {
        return res.status(404).json({
          error: { code: "CHECKOUT_NOT_FOUND", message: "Checkout não encontrado" },
        });
      }

      if (checkout.course?.merchantId !== merchantId) {
        return res.status(403).json({
          error: { code: "FORBIDDEN", message: "Acesso negado" },
        });
      }

      const upsells = await checkoutRepository.findUpsellOffersByCheckoutId(checkoutId);

      const response = upsells.map((up) => ({
        id: up.id,
        checkoutId: up.checkoutId,
        type: up.type,
        courseId: up.courseId,
        headline: up.headline,
        description: up.description,
        videoUrl: up.videoUrl,
        amountCents: up.amountCents,
        triggerAfter: up.triggerAfter,
        position: up.position,
        active: up.active,
        createdAt: up.createdAt.toISOString(),
        updatedAt: up.updatedAt.toISOString(),
      }));

      res.json(response);
    } catch (err) {
      logger.error({ err }, "Erro ao listar upsells");
      res.status(500).json({
        error: { code: "INTERNAL_ERROR", message: "Erro interno" },
      });
    }
  }
);

/**
 * POST /checkouts/:id/upsells
 * Criar upsell
 */
productCheckoutRouter.post(
  "/checkouts/:id/upsells",
  checkoutLimiter,
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: { code: "UNAUTHORIZED", message: "Usuário não autenticado" },
        });
      }

      const merchantId = await ensureMerchantId(req.user.id);
      const checkoutId = req.params.id;
      const parsed = CreateUpsellOfferRequestSchema.parse(req.body);

      const checkoutRepository = new PrismaProductCheckoutRepository();
      const checkout = await checkoutRepository.findById(checkoutId);

      if (!checkout) {
        return res.status(404).json({
          error: { code: "CHECKOUT_NOT_FOUND", message: "Checkout não encontrado" },
        });
      }

      if (checkout.course?.merchantId !== merchantId) {
        return res.status(403).json({
          error: { code: "FORBIDDEN", message: "Acesso negado" },
        });
      }

      // Verificar se o curso do upsell pertence ao merchant
      const courseRepository = new PrismaCourseRepository();
      const upsellCourse = await courseRepository.findById(parsed.courseId);

      if (!upsellCourse || upsellCourse.merchantId !== merchantId) {
        return res.status(400).json({
          error: { code: "INVALID_COURSE", message: "Curso do upsell inválido" },
        });
      }

      const upsell = await checkoutRepository.createUpsellOffer({
        checkoutId,
        type: parsed.type as UpsellType,
        courseId: parsed.courseId,
        headline: parsed.headline,
        description: parsed.description,
        videoUrl: parsed.videoUrl,
        amountCents: parsed.amountCents,
        triggerAfter: parsed.triggerAfter as UpsellTrigger,
        position: parsed.position,
      });

      const response = {
        id: upsell.id,
        checkoutId: upsell.checkoutId,
        type: upsell.type,
        courseId: upsell.courseId,
        headline: upsell.headline,
        description: upsell.description,
        videoUrl: upsell.videoUrl,
        amountCents: upsell.amountCents,
        triggerAfter: upsell.triggerAfter,
        position: upsell.position,
        active: upsell.active,
        createdAt: upsell.createdAt.toISOString(),
        updatedAt: upsell.updatedAt.toISOString(),
      };

      const validated = UpsellOfferResponseSchema.parse(response);
      res.status(201).json(validated);
    } catch (err) {
      if (err instanceof ZodError) {
        return res.status(400).json({
          error: { code: "VALIDATION_ERROR", message: "Dados inválidos", details: err.issues },
        });
      }
      logger.error({ err }, "Erro ao criar upsell");
      res.status(500).json({
        error: { code: "INTERNAL_ERROR", message: "Erro interno" },
      });
    }
  }
);

/**
 * PUT /upsells/:id
 * Atualizar upsell
 */
productCheckoutRouter.put(
  "/upsells/:id",
  checkoutLimiter,
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: { code: "UNAUTHORIZED", message: "Usuário não autenticado" },
        });
      }

      const merchantId = await ensureMerchantId(req.user.id);
      const upsellId = req.params.id;
      const parsed = UpdateUpsellOfferRequestSchema.parse(req.body);

      const checkoutRepository = new PrismaProductCheckoutRepository();
      const upsell = await checkoutRepository.findUpsellOfferById(upsellId);

      if (!upsell) {
        return res.status(404).json({
          error: { code: "UPSELL_NOT_FOUND", message: "Upsell não encontrado" },
        });
      }

      const checkout = await checkoutRepository.findById(upsell.checkoutId);
      if (!checkout || checkout.course?.merchantId !== merchantId) {
        return res.status(403).json({
          error: { code: "FORBIDDEN", message: "Acesso negado" },
        });
      }

      const updated = await checkoutRepository.updateUpsellOffer(upsellId, {
        ...parsed,
        triggerAfter: parsed.triggerAfter as UpsellTrigger | undefined,
      });

      const response = {
        id: updated.id,
        checkoutId: updated.checkoutId,
        type: updated.type,
        courseId: updated.courseId,
        headline: updated.headline,
        description: updated.description,
        videoUrl: updated.videoUrl,
        amountCents: updated.amountCents,
        triggerAfter: updated.triggerAfter,
        position: updated.position,
        active: updated.active,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      };

      const validated = UpsellOfferResponseSchema.parse(response);
      res.json(validated);
    } catch (err) {
      if (err instanceof ZodError) {
        return res.status(400).json({
          error: { code: "VALIDATION_ERROR", message: "Dados inválidos", details: err.issues },
        });
      }
      logger.error({ err }, "Erro ao atualizar upsell");
      res.status(500).json({
        error: { code: "INTERNAL_ERROR", message: "Erro interno" },
      });
    }
  }
);

/**
 * DELETE /upsells/:id
 * Excluir upsell
 */
productCheckoutRouter.delete(
  "/upsells/:id",
  checkoutLimiter,
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: { code: "UNAUTHORIZED", message: "Usuário não autenticado" },
        });
      }

      const merchantId = await ensureMerchantId(req.user.id);
      const upsellId = req.params.id;

      const checkoutRepository = new PrismaProductCheckoutRepository();
      const upsell = await checkoutRepository.findUpsellOfferById(upsellId);

      if (!upsell) {
        return res.status(404).json({
          error: { code: "UPSELL_NOT_FOUND", message: "Upsell não encontrado" },
        });
      }

      const checkout = await checkoutRepository.findById(upsell.checkoutId);
      if (!checkout || checkout.course?.merchantId !== merchantId) {
        return res.status(403).json({
          error: { code: "FORBIDDEN", message: "Acesso negado" },
        });
      }

      await checkoutRepository.deleteUpsellOffer(upsellId);

      res.status(204).send();
    } catch (err) {
      logger.error({ err }, "Erro ao excluir upsell");
      res.status(500).json({
        error: { code: "INTERNAL_ERROR", message: "Erro interno" },
      });
    }
  }
);

// ============================================
// Public Route (sem auth)
// ============================================

/**
 * GET /c/:slug
 * Checkout público por slug
 */
productCheckoutRouter.get("/c/:slug", checkoutLimiter, async (req: Request, res: Response) => {
  try {
    const slug = req.params.slug;

    const checkoutRepository = new PrismaProductCheckoutRepository();
    const checkout = await checkoutRepository.findPublicCheckout(slug);

    if (!checkout) {
      return res.status(404).json({
        error: { code: "CHECKOUT_NOT_FOUND", message: "Checkout não encontrado" },
      });
    }

    // Incrementar visitas
    await checkoutRepository.incrementVisits(checkout.id);

    const price = checkout.course?.prices[0];
    const merchant = checkout.course?.merchant;

    const response = {
      id: checkout.id,
      slug: checkout.slug,
      course: {
        id: checkout.course!.id,
        title: checkout.course!.title,
        description: checkout.course!.description,
        thumbnailUrl: checkout.course!.thumbnailUrl,
        price: price
          ? {
              amountCents: price.amountCents,
              type: price.type,
              recurrenceInterval: price.recurrenceInterval,
            }
          : null,
      },
      builderConfig: checkout.builderConfig,
      themeConfig: checkout.themeConfig,
      settings: checkout.settings,
      orderBumps: checkout.orderBumps.map((ob) => ({
        id: ob.id,
        headline: ob.headline,
        description: ob.description,
        amountCents: ob.amountCents,
        course: {
          title: "", // TODO: buscar título do curso do bump
          thumbnailUrl: null,
        },
      })),
      merchant: {
        name: merchant?.name ?? "Turbofy",
        logoUrl: merchant?.domainConfig?.logoUrl ?? null,
      },
    };

    res.json(response);
  } catch (err) {
    logger.error({ err }, "Erro ao buscar checkout público");
    res.status(500).json({
      error: { code: "INTERNAL_ERROR", message: "Erro interno" },
    });
  }
});

// ============================================
// Schema de validação para pagamento
// ============================================

const ProcessPaymentRequestSchema = z.object({
  buyer: z.object({
    name: z.string().min(2).max(100),
    email: z.string().email(),
    document: z.string().min(11).max(18), // CPF ou CNPJ
    phone: z.string().optional(),
  }),
  paymentMethod: z.enum(["PIX", "BOLETO", "CREDIT_CARD", "PIX_AUTOMATIC"]),
  orderBumpIds: z.array(z.string().uuid()).optional().default([]),
  couponCode: z.string().optional(),
  affiliateCode: z.string().optional(),
  cardData: z
    .object({
      number: z.string(),
      holderName: z.string(),
      expirationMonth: z.string(),
      expirationYear: z.string(),
      cvv: z.string(),
      installments: z.number().int().min(1).max(12).optional(),
    })
    .optional(),
});

/**
 * POST /c/:slug/pay
 * Processar pagamento do checkout
 */
productCheckoutRouter.post("/c/:slug/pay", checkoutLimiter, async (req: Request, res: Response) => {
  try {
    const slug = req.params.slug;
    const idempotencyKey = req.headers["x-idempotency-key"] as string;

    if (!idempotencyKey) {
      return res.status(400).json({
        error: { code: "MISSING_IDEMPOTENCY_KEY", message: "Header X-Idempotency-Key é obrigatório" },
      });
    }

    const parsed = ProcessPaymentRequestSchema.parse(req.body);

    // Buscar checkout pelo slug
    const checkoutRepository = new PrismaProductCheckoutRepository();
    const checkout = await checkoutRepository.findBySlug(slug);

    if (!checkout) {
      return res.status(404).json({
        error: { code: "CHECKOUT_NOT_FOUND", message: "Checkout não encontrado" },
      });
    }

    if (!checkout.published) {
      return res.status(400).json({
        error: { code: "CHECKOUT_NOT_PUBLISHED", message: "Checkout não está publicado" },
      });
    }

    // Processar pagamento
    const useCase = new ProcessCheckoutPayment();
    const result = await useCase.execute({
      checkoutId: checkout.id,
      buyer: parsed.buyer,
      paymentMethod: parsed.paymentMethod,
      orderBumpIds: parsed.orderBumpIds,
      couponCode: parsed.couponCode,
      idempotencyKey,
      affiliateCode: parsed.affiliateCode,
      cardData: parsed.cardData,
    });

    res.status(201).json(result);
  } catch (err) {
    if (err instanceof ZodError) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Dados inválidos", details: err.issues },
      });
    }
    if (err instanceof Error) {
      if (err.message.includes("not found")) {
        return res.status(404).json({
          error: { code: "NOT_FOUND", message: err.message },
        });
      }
      if (err.message.includes("expired") || err.message.includes("limit reached")) {
        return res.status(400).json({
          error: { code: "COUPON_ERROR", message: err.message },
        });
      }
      if (err.message.includes("Credit card") || err.message.includes("Pix Automatic")) {
        return res.status(400).json({
          error: { code: "PAYMENT_METHOD_NOT_SUPPORTED", message: err.message },
        });
      }
    }
    logger.error({ err }, "Erro ao processar pagamento");
    res.status(500).json({
      error: { code: "INTERNAL_ERROR", message: "Erro interno ao processar pagamento" },
    });
  }
});

