import { Router, Request, Response } from "express";
import { ZodError } from "zod";
import { authMiddleware } from "../middlewares/authMiddleware";
import { logger } from "../../logger";
import { ensureMerchantId } from "../utils/ensureMerchantId";
import {
  CreateCouponRequestSchema,
  UpdateCouponRequestSchema,
  ValidateCouponRequestSchema,
  ListCouponsQuerySchema,
} from "../schemas/coupons";
import { PrismaCouponRepository } from "../../database/repositories/PrismaCouponRepository";
import { PrismaCourseRepository } from "../../database/repositories/PrismaCourseRepository";
import { CreateCoupon, CourseNotFoundError, CourseUnauthorizedError, CouponCodeExistsError } from "../../../application/useCases/CreateCoupon";
import { ListCoupons } from "../../../application/useCases/ListCoupons";
import { UpdateCoupon, CouponNotFoundError as UpdateCouponNotFoundError, CouponUnauthorizedError as UpdateCouponUnauthorizedError } from "../../../application/useCases/UpdateCoupon";
import { DeleteCoupon, CouponNotFoundError as DeleteCouponNotFoundError, CouponUnauthorizedError as DeleteCouponUnauthorizedError } from "../../../application/useCases/DeleteCoupon";
import { ValidateCoupon } from "../../../application/useCases/ValidateCoupon";
import { CouponValidationError, Coupon } from "../../../domain/entities/Coupon";

/**
 * @security All routes require authentication except validate
 * @performance Optimized queries with pagination
 * @maintainability Clean route handlers with use cases
 * @testability Routes can be tested with supertest
 */

export const couponsRouter = Router();

// Helper to format coupon response
const formatCouponResponse = (coupon: Coupon) => ({
  id: coupon.id,
  merchantId: coupon.merchantId,
  courseId: coupon.courseId,
  code: coupon.code,
  description: coupon.description ?? null,
  discountType: coupon.discountType,
  percentage: coupon.percentage ?? null,
  amountCents: coupon.amountCents ?? null,
  maxRedemptions: coupon.maxRedemptions ?? null,
  redemptions: coupon.redemptions,
  expiresAt: coupon.expiresAt?.toISOString() ?? null,
  active: coupon.active,
  createdAt: coupon.createdAt.toISOString(),
  updatedAt: coupon.updatedAt.toISOString(),
});

// List coupons
couponsRouter.get("/", authMiddleware, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        error: {
          code: "UNAUTHORIZED",
          message: "Usuário não autenticado",
        },
      });
    }

    const merchantId = await ensureMerchantId(req.user.id);
    const query = ListCouponsQuerySchema.parse(req.query);

    const couponRepository = new PrismaCouponRepository();
    const listCoupons = new ListCoupons(couponRepository);

    const result = await listCoupons.execute({
      merchantId,
      courseId: query.courseId,
      active: query.active,
      search: query.search,
      limit: query.limit,
      offset: query.offset,
    });

    res.json({
      coupons: result.coupons.map(formatCouponResponse),
      stats: result.stats,
      total: result.total,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Dados inválidos",
          details: error.issues,
        },
      });
    }

    logger.error({ error }, "Error listing coupons");
    res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "Erro interno do servidor",
      },
    });
  }
});

// Get coupon by ID
couponsRouter.get("/:id", authMiddleware, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        error: {
          code: "UNAUTHORIZED",
          message: "Usuário não autenticado",
        },
      });
    }

    const merchantId = await ensureMerchantId(req.user.id);
    const { id } = req.params;

    const couponRepository = new PrismaCouponRepository();
    const coupon = await couponRepository.findById(id);

    if (!coupon) {
      return res.status(404).json({
        error: {
          code: "COUPON_NOT_FOUND",
          message: "Cupom não encontrado",
        },
      });
    }

    if (coupon.merchantId !== merchantId) {
      return res.status(403).json({
        error: {
          code: "FORBIDDEN",
          message: "Você não tem permissão para acessar este cupom",
        },
      });
    }

    res.json(formatCouponResponse(coupon));
  } catch (error) {
    logger.error({ error }, "Error getting coupon");
    res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "Erro interno do servidor",
      },
    });
  }
});

// Create coupon
couponsRouter.post("/", authMiddleware, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        error: {
          code: "UNAUTHORIZED",
          message: "Usuário não autenticado",
        },
      });
    }

    const merchantId = await ensureMerchantId(req.user.id);
    const body = CreateCouponRequestSchema.parse(req.body);

    const couponRepository = new PrismaCouponRepository();
    const courseRepository = new PrismaCourseRepository();
    const createCoupon = new CreateCoupon(couponRepository, courseRepository);

    const result = await createCoupon.execute({
      merchantId,
      courseId: body.courseId,
      code: body.code,
      description: body.description,
      discountType: body.discountType,
      percentage: body.percentage,
      amountCents: body.amountCents,
      maxRedemptions: body.maxRedemptions,
      expiresAt: body.expiresAt,
    });

    res.status(201).json(formatCouponResponse(result.coupon));
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Dados inválidos",
          details: error.issues,
        },
      });
    }

    if (error instanceof CourseNotFoundError) {
      return res.status(404).json({
        error: {
          code: "COURSE_NOT_FOUND",
          message: error.message,
        },
      });
    }

    if (error instanceof CourseUnauthorizedError) {
      return res.status(403).json({
        error: {
          code: "FORBIDDEN",
          message: error.message,
        },
      });
    }

    if (error instanceof CouponCodeExistsError) {
      return res.status(409).json({
        error: {
          code: "COUPON_CODE_EXISTS",
          message: error.message,
        },
      });
    }

    if (error instanceof CouponValidationError) {
      return res.status(400).json({
        error: {
          code: "COUPON_VALIDATION_ERROR",
          message: error.message,
        },
      });
    }

    logger.error({ error }, "Error creating coupon");
    res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "Erro interno do servidor",
      },
    });
  }
});

// Update coupon
couponsRouter.put("/:id", authMiddleware, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        error: {
          code: "UNAUTHORIZED",
          message: "Usuário não autenticado",
        },
      });
    }

    const merchantId = await ensureMerchantId(req.user.id);
    const { id } = req.params;
    const body = UpdateCouponRequestSchema.parse(req.body);

    const couponRepository = new PrismaCouponRepository();
    const updateCoupon = new UpdateCoupon(couponRepository);

    const result = await updateCoupon.execute({
      couponId: id,
      merchantId,
      description: body.description,
      percentage: body.percentage,
      amountCents: body.amountCents,
      maxRedemptions: body.maxRedemptions,
      expiresAt: body.expiresAt,
      active: body.active,
    });

    res.json(formatCouponResponse(result.coupon));
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Dados inválidos",
          details: error.issues,
        },
      });
    }

    if (error instanceof UpdateCouponNotFoundError) {
      return res.status(404).json({
        error: {
          code: "COUPON_NOT_FOUND",
          message: error.message,
        },
      });
    }

    if (error instanceof UpdateCouponUnauthorizedError) {
      return res.status(403).json({
        error: {
          code: "FORBIDDEN",
          message: error.message,
        },
      });
    }

    if (error instanceof CouponValidationError) {
      return res.status(400).json({
        error: {
          code: "COUPON_VALIDATION_ERROR",
          message: error.message,
        },
      });
    }

    logger.error({ error }, "Error updating coupon");
    res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "Erro interno do servidor",
      },
    });
  }
});

// Delete coupon
couponsRouter.delete("/:id", authMiddleware, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        error: {
          code: "UNAUTHORIZED",
          message: "Usuário não autenticado",
        },
      });
    }

    const merchantId = await ensureMerchantId(req.user.id);
    const { id } = req.params;

    const couponRepository = new PrismaCouponRepository();
    const deleteCoupon = new DeleteCoupon(couponRepository);

    await deleteCoupon.execute({
      couponId: id,
      merchantId,
    });

    res.status(204).send();
  } catch (error) {
    if (error instanceof DeleteCouponNotFoundError) {
      return res.status(404).json({
        error: {
          code: "COUPON_NOT_FOUND",
          message: error.message,
        },
      });
    }

    if (error instanceof DeleteCouponUnauthorizedError) {
      return res.status(403).json({
        error: {
          code: "FORBIDDEN",
          message: error.message,
        },
      });
    }

    logger.error({ error }, "Error deleting coupon");
    res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "Erro interno do servidor",
      },
    });
  }
});

// Toggle coupon status
couponsRouter.patch("/:id/toggle", authMiddleware, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        error: {
          code: "UNAUTHORIZED",
          message: "Usuário não autenticado",
        },
      });
    }

    const merchantId = await ensureMerchantId(req.user.id);
    const { id } = req.params;

    const couponRepository = new PrismaCouponRepository();
    const coupon = await couponRepository.findById(id);

    if (!coupon) {
      return res.status(404).json({
        error: {
          code: "COUPON_NOT_FOUND",
          message: "Cupom não encontrado",
        },
      });
    }

    if (coupon.merchantId !== merchantId) {
      return res.status(403).json({
        error: {
          code: "FORBIDDEN",
          message: "Você não tem permissão para atualizar este cupom",
        },
      });
    }

    if (coupon.active) {
      coupon.deactivate();
    } else {
      coupon.activate();
    }

    const updatedCoupon = await couponRepository.update(coupon);

    res.json(formatCouponResponse(updatedCoupon));
  } catch (error) {
    logger.error({ error }, "Error toggling coupon status");
    res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "Erro interno do servidor",
      },
    });
  }
});

// Validate coupon (public endpoint for checkout)
couponsRouter.post("/validate", async (req: Request, res: Response) => {
  try {
    const body = ValidateCouponRequestSchema.parse(req.body);
    const merchantId = req.headers["x-merchant-id"] as string;

    if (!merchantId) {
      return res.status(400).json({
        error: {
          code: "MERCHANT_ID_REQUIRED",
          message: "merchantId é obrigatório",
        },
      });
    }

    const couponRepository = new PrismaCouponRepository();
    const validateCoupon = new ValidateCoupon(couponRepository);

    const result = await validateCoupon.execute({
      code: body.code,
      merchantId,
      courseId: body.courseId,
      originalAmountCents: body.originalAmountCents,
    });

    res.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Dados inválidos",
          details: error.issues,
        },
      });
    }

    logger.error({ error }, "Error validating coupon");
    res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "Erro interno do servidor",
      },
    });
  }
});
