import { Request, Response, Router } from "express";
import { ZodError, z } from "zod";
import { CreateCharge } from "../../../application/useCases/CreateCharge";
import { LinkAssociate } from "../../../application/useCases/LinkAssociate";
import { ChargeMethod } from "../../../domain/entities/Charge";
import { MessagingFactory } from "../../adapters/messaging/MessagingFactory";
import { PaymentProviderError } from "../../adapters/payment/PaymentProviderErrors";
import { PaymentProviderFactory } from "../../adapters/payment/PaymentProviderFactory";
import { PrismaChargeRepository } from "../../database/PrismaChargeRepository";
import { prisma } from "../../database/prismaClient";
import { PrismaPaymentInteractionRepository } from "../../database/repositories/PrismaPaymentInteractionRepository";
import { logger } from "../../logger";
import { decryptSecret } from "../../security/crypto";
import { authMiddleware } from "../middlewares/authMiddleware";
import { ensureMerchantId } from "../utils/ensureMerchantId";

const normalizeDocument = (value: string): string => value.replace(/\D/g, "");

const associatePayloadSchema = z.object({
  document: z.string().min(11).max(18),
  name: z.string().min(3),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  splitPercentage: z.number().min(0.01).max(100),
});

const searchSchema = z.object({
  document: z.string().min(11).max(18),
});

const pixPayloadSchema = z.object({
  amountCents: z.number().int().min(500, "Valor mínimo é R$ 5,00 (500 centavos)"),
  description: z.string().optional(),
  expiresAt: z.string().datetime().optional(),
  externalRef: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  // splits são calculados automaticamente baseado nos associados configurados
  // Se fornecido, será usado ao invés do cálculo automático
  splits: z
    .array(
      z.object({
        merchantId: z.string(),
        amountCents: z.number().int().positive().optional(),
        percentage: z.number().positive().max(100).optional(),
      })
    )
    .optional(),
});

const PROVIDER_KEY = "RIFEIRO_PIX";

export const rifeiroRouter = Router();

const assertRifeiro = async (merchantId: string) => {
  const merchant = await prisma.merchant.findUnique({
    where: { id: merchantId },
    select: { type: true },
  });

  if (!merchant || merchant.type !== "RIFEIRO") {
    const error = new Error("Apenas contas RIFEIRO podem acessar este recurso");
    (error as any).statusCode = 403;
    throw error;
  }
};

const resolveCredentials = async (clientId: string, clientSecret: string) => {
  const record = await prisma.providerCredentials.findFirst({
    where: { clientId, provider: PROVIDER_KEY },
  });

  if (!record) {
    return null;
  }

  try {
    const storedSecret = decryptSecret(record.clientSecret);
    if (storedSecret !== clientSecret) {
      return null;
    }
  } catch (err) {
    logger.error({ err }, "Falha ao descriptografar secret do rifeiro");
    return null;
  }

  return record;
};

const buildPixIdempotencyKey = (clientId: string) =>
  `rifeiro-pix-${clientId}-${Date.now()}`;

rifeiroRouter.post("/pix", async (req: Request, res: Response) => {
  try {
    const clientId = req.header("x-client-id");
    const clientSecret = req.header("x-client-secret");

    if (!clientId || !clientSecret) {
      return res.status(401).json({
        error: {
          code: "CREDENTIALS_REQUIRED",
          message: "Headers x-client-id e x-client-secret são obrigatórios",
        },
      });
    }

    const credential = await resolveCredentials(clientId, clientSecret);
    if (!credential) {
      return res.status(401).json({
        error: { code: "INVALID_CREDENTIALS", message: "Credenciais inválidas" },
      });
    }

    const parsed = pixPayloadSchema.parse(req.body);
    const chargeRepository = new PrismaChargeRepository();
    const paymentProvider = await PaymentProviderFactory.createForMerchant(
      credential.merchantId
    );
    const messaging = MessagingFactory.create();
    const paymentInteractionRepository =
      new PrismaPaymentInteractionRepository();

    const useCase = new CreateCharge(
      chargeRepository,
      paymentProvider,
      messaging,
      paymentInteractionRepository
    );

    const idempotencyKey =
      req.header("x-idempotency-key") ?? buildPixIdempotencyKey(clientId);

    const result = await useCase.execute({
      idempotencyKey,
      merchantId: credential.merchantId,
      amountCents: parsed.amountCents,
      currency: "BRL",
      description: parsed.description,
      method: ChargeMethod.PIX,
      expiresAt: parsed.expiresAt ? new Date(parsed.expiresAt) : undefined,
      externalRef: parsed.externalRef,
      metadata: {
        ...(parsed.metadata ?? {}),
        source: "rifeiro-api",
        clientId,
      },
      splits: parsed.splits,
    });

    const { charge, splits } = result;

    return res.status(201).json({
      id: charge.id,
      status: charge.status,
      amountCents: charge.amountCents,
      description: charge.description,
      pix: {
        qrCode: charge.pixQrCode,
        copyPaste: charge.pixCopyPaste,
        expiresAt: (charge.expiresAt ?? new Date()).toISOString(),
      },
      splits: splits?.map((split) => ({
        id: split.id,
        merchantId: split.merchantId,
        amountCents:
          split.amountCents ?? split.computeAmountForTotal(charge.amountCents),
        percentage: split.percentage,
      })),
      createdAt: charge.createdAt,
    });
  } catch (err) {
    if (err instanceof ZodError) {
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: err.message,
          details: err.flatten(),
        },
      });
    }
    if (err instanceof PaymentProviderError) {
      return res.status(err.statusCode).json({
        error: { code: err.code, message: err.message },
      });
    }
    logger.error({ err }, "Erro em POST /rifeiro/pix");
    return res
      .status(500)
      .json({ error: { code: "INTERNAL_ERROR", message: "Erro interno" } });
  }
});

rifeiroRouter.get("/pix/:id", async (req: Request, res: Response) => {
  try {
    const clientId = req.header("x-client-id");
    const clientSecret = req.header("x-client-secret");

    if (!clientId || !clientSecret) {
      return res.status(401).json({
        error: {
          code: "CREDENTIALS_REQUIRED",
          message: "Headers x-client-id e x-client-secret são obrigatórios",
        },
      });
    }

    const credential = await resolveCredentials(clientId, clientSecret);
    if (!credential) {
      return res.status(401).json({
        error: { code: "INVALID_CREDENTIALS", message: "Credenciais inválidas" },
      });
    }

    const chargeRepository = new PrismaChargeRepository();
    const charge = await chargeRepository.findById(req.params.id);

    if (!charge || charge.merchantId !== credential.merchantId) {
      return res.status(404).json({
        error: { code: "NOT_FOUND", message: "Cobrança não encontrada" },
      });
    }

    return res.json({
      id: charge.id,
      status: charge.status,
      amountCents: charge.amountCents,
      description: charge.description,
      pix: charge.pixQrCode
        ? {
            qrCode: charge.pixQrCode,
            copyPaste: charge.pixCopyPaste,
            expiresAt: (charge.expiresAt ?? new Date()).toISOString(),
          }
        : null,
      createdAt: charge.createdAt,
      updatedAt: charge.updatedAt,
    });
  } catch (err) {
    logger.error({ err }, "Erro em GET /rifeiro/pix/:id");
    return res
      .status(500)
      .json({ error: { code: "INTERNAL_ERROR", message: "Erro interno" } });
  }
});

rifeiroRouter.use(authMiddleware);

rifeiroRouter.get(
  "/associados/search",
  async (req: Request, res: Response) => {
    try {
      if (!req.user?.id) {
        return res.status(401).json({
          error: { code: "UNAUTHORIZED", message: "Usuário não autenticado" },
        });
      }

      const merchantId = await ensureMerchantId(req.user.id);
      await assertRifeiro(merchantId);

      const { document } = searchSchema.parse(req.query);
      const normalized = normalizeDocument(document);

      const user = await prisma.user.findUnique({
        where: { document: normalized },
        select: { id: true, email: true, document: true, phone: true },
      });

      const affiliate = await prisma.affiliate.findFirst({
        where: { merchantId, document: normalized },
      });

      const commissionRule = affiliate
        ? await prisma.commissionRule.findFirst({
            where: {
              merchantId,
              affiliateId: affiliate.id,
              productId: null,
            },
            orderBy: { priority: "desc" },
          })
        : null;

      return res.json({
        found: Boolean(user || affiliate),
        user,
        affiliate: affiliate
          ? {
              id: affiliate.id,
              name: affiliate.name,
              email: affiliate.email,
              document: affiliate.document,
              phone: affiliate.phone,
              splitPercentage:
                Number(commissionRule?.value ?? affiliate.commissionRate) ?? null,
              active: affiliate.active,
              createdAt: affiliate.createdAt,
              updatedAt: affiliate.updatedAt,
            }
          : null,
      });
    } catch (err) {
      if (err instanceof ZodError) {
        return res.status(400).json({
          error: {
            code: "VALIDATION_ERROR",
            message: err.message,
            details: err.flatten(),
          },
        });
      }
      const statusCode = (err as any)?.statusCode ?? 500;
      logger.error({ err }, "Erro em GET /rifeiro/associados/search");
      return res
        .status(statusCode)
        .json({ error: { code: "INTERNAL_ERROR", message: "Erro interno" } });
    }
  }
);

rifeiroRouter.get("/associados", async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({
        error: { code: "UNAUTHORIZED", message: "Usuário não autenticado" },
      });
    }

    const merchantId = await ensureMerchantId(req.user.id);
    await assertRifeiro(merchantId);

    const affiliates = await prisma.affiliate.findMany({
      where: { merchantId },
      orderBy: { createdAt: "desc" },
    });

    const affiliateIds = affiliates.map((a) => a.id);

    const commissionRules = await prisma.commissionRule.findMany({
      where: {
        merchantId,
        affiliateId: { in: affiliateIds },
        productId: null,
      },
    });

    const rulesByAffiliate = new Map(
      commissionRules.map((rule) => [rule.affiliateId ?? "", rule])
    );

    const result = affiliates.map((affiliate) => {
      const rule = rulesByAffiliate.get(affiliate.id);
      return {
        id: affiliate.id,
        name: affiliate.name,
        email: affiliate.email,
        document: affiliate.document,
        phone: affiliate.phone,
        splitPercentage:
          Number(rule?.value ?? affiliate.commissionRate) ?? undefined,
        status: affiliate.active ? "ACTIVE" : "INACTIVE",
        createdAt: affiliate.createdAt,
        updatedAt: affiliate.updatedAt,
      };
    });

    return res.json({ items: result, total: result.length });
  } catch (err) {
    const statusCode = (err as any)?.statusCode ?? 500;
    logger.error({ err }, "Erro em GET /rifeiro/associados");
    return res
      .status(statusCode)
      .json({ error: { code: "INTERNAL_ERROR", message: "Erro interno" } });
  }
});

rifeiroRouter.post("/associados", async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({
        error: { code: "UNAUTHORIZED", message: "Usuário não autenticado" },
      });
    }

    const merchantId = await ensureMerchantId(req.user.id);
    await assertRifeiro(merchantId);

    const payload = associatePayloadSchema.parse(req.body);
    const useCase = new LinkAssociate();

    const result = await useCase.execute({
      merchantId,
      document: payload.document,
      splitPercentage: payload.splitPercentage,
      name: payload.name,
      email: payload.email,
      phone: payload.phone,
    });

    return res.status(201).json({
      affiliate: result.affiliate,
      commissionRule: result.commissionRule,
      user: result.user ?? null,
      message:
        "Associado vinculado com sucesso. Exclusão somente via suporte (WhatsApp).",
    });
  } catch (err) {
    if (err instanceof ZodError) {
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: err.message,
          details: err.flatten(),
        },
      });
    }
    const statusCode = (err as any)?.statusCode ?? 500;
    logger.error({ err }, "Erro em POST /rifeiro/associados");
    return res
      .status(statusCode)
      .json({ error: { code: "INTERNAL_ERROR", message: "Erro interno" } });
  }
});

rifeiroRouter.get("/dashboard", async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({
        error: { code: "UNAUTHORIZED", message: "Usuário não autenticado" },
      });
    }

    const merchantId = await ensureMerchantId(req.user.id);
    await assertRifeiro(merchantId);

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [splitsToday, splitsWeek, splitsMonth, settlementsToday, settlementsWeek, settlementsMonth, wallet] = await Promise.all([
      prisma.chargeSplit.aggregate({
        where: {
          merchantId,
          charge: { status: "PAID", paidAt: { gte: todayStart } },
        },
        _sum: { amountCents: true },
      }),
      prisma.chargeSplit.aggregate({
        where: {
          merchantId,
          charge: { status: "PAID", paidAt: { gte: weekStart } },
        },
        _sum: { amountCents: true },
      }),
      prisma.chargeSplit.aggregate({
        where: {
          merchantId,
          charge: { status: "PAID", paidAt: { gte: monthStart } },
        },
        _sum: { amountCents: true },
      }),
      prisma.settlement.aggregate({
        where: {
          merchantId,
          status: "COMPLETED",
          processedAt: { gte: todayStart },
        },
        _sum: { amountCents: true },
      }),
      prisma.settlement.aggregate({
        where: {
          merchantId,
          status: "COMPLETED",
          processedAt: { gte: weekStart },
        },
        _sum: { amountCents: true },
      }),
      prisma.settlement.aggregate({
        where: {
          merchantId,
          status: "COMPLETED",
          processedAt: { gte: monthStart },
        },
        _sum: { amountCents: true },
      }),
      prisma.wallet.findUnique({
        where: { merchantId },
        select: { availableBalanceCents: true, pendingBalanceCents: true },
      }),
    ]);

    const recentCharges = await prisma.charge.findMany({
      where: { merchantId },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        amountCents: true,
        status: true,
        method: true,
        createdAt: true,
        paidAt: true,
        fees: {
          select: { amountCents: true },
        },
      },
    });

    const chargesWithNet = recentCharges.map((charge) => {
      const totalFees = charge.fees.reduce((sum, fee) => sum + fee.amountCents, 0);
      return {
        id: charge.id,
        type: charge.method ?? "PIX",
        status: charge.status,
        amountCents: charge.amountCents,
        netAmountCents: charge.amountCents - totalFees,
        createdAt: charge.createdAt.toISOString(),
      };
    });

    return res.json({
      splits: {
        today: splitsToday._sum.amountCents ?? 0,
        week: splitsWeek._sum.amountCents ?? 0,
        month: splitsMonth._sum.amountCents ?? 0,
      },
      settlements: {
        today: settlementsToday._sum.amountCents ?? 0,
        week: settlementsWeek._sum.amountCents ?? 0,
        month: settlementsMonth._sum.amountCents ?? 0,
      },
      wallet: {
        availableCents: wallet?.availableBalanceCents ?? 0,
        pendingCents: wallet?.pendingBalanceCents ?? 0,
      },
      recentCharges: chargesWithNet,
    });
  } catch (err) {
    const statusCode = (err as any)?.statusCode ?? 500;
    logger.error({ err }, "Erro em GET /rifeiro/dashboard");
    return res
      .status(statusCode)
      .json({ error: { code: "INTERNAL_ERROR", message: "Erro interno" } });
  }
});

