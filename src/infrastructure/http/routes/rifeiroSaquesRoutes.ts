/**
 * Rotas de saques para Rifeiros
 * 
 * Usa Wallet (merchant-based) + Settlement ao invés de UserLedger + Withdrawal (user-based)
 */

import { Request, Response, Router } from "express";
import { z, ZodError } from "zod";
import { CreateSettlement } from "../../../application/useCases/CreateSettlement";
import { MessagingFactory } from "../../adapters/messaging/MessagingFactory";
import { prisma } from "../../database/prismaClient";
import { PrismaSettlementRepository } from "../../database/PrismaSettlementRepository";
import { logger } from "../../logger";
import { ensureAuthenticated } from "../middlewares/authMiddleware";

export const rifeiroSaquesRouter = Router();

rifeiroSaquesRouter.use(ensureAuthenticated);

/**
 * Helper para obter merchantId do usuário e validar que é Rifeiro
 */
async function ensureMerchantId(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { merchantId: true },
  });

  if (!user?.merchantId) {
    throw new Error("Usuário não possui merchant associado");
  }

  return user.merchantId;
}

async function assertRifeiro(merchantId: string): Promise<void> {
  const merchant = await prisma.merchant.findUnique({
    where: { id: merchantId },
    select: { type: true },
  });

  if (!merchant) {
    throw new Error("Merchant não encontrado");
  }

  if (merchant.type !== "RIFEIRO") {
    throw new Error("Apenas Rifeiros podem acessar este recurso");
  }
}

/**
 * GET /rifeiro/saques
 * Dashboard de saques do Rifeiro
 */
rifeiroSaquesRouter.get("/", async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({
        error: { code: "UNAUTHORIZED", message: "Usuário não autenticado" },
      });
    }

    const merchantId = await ensureMerchantId(req.user.id);
    await assertRifeiro(merchantId);

    // Buscar wallet, settlements e pixKey
    const [wallet, settlements, completedSettlements, pixKey, merchant] = await Promise.all([
      prisma.wallet.findUnique({
        where: { merchantId },
        select: {
          availableBalanceCents: true,
          pendingBalanceCents: true,
          totalEarnedCents: true,
        },
      }),
      prisma.settlement.findMany({
        where: { merchantId },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          amountCents: true,
          status: true,
          createdAt: true,
          processedAt: true,
          failureReason: true,
        },
      }),
      prisma.settlement.aggregate({
        where: { merchantId, status: "COMPLETED" },
        _sum: { amountCents: true },
      }),
      (prisma as any).pixKey.findFirst({
        where: { merchantId },
      } as any),
      prisma.merchant.findUnique({
        where: { id: merchantId },
        select: {
          name: true,
          document: true,
        },
      }),
    ]);

    // Calcular total solicitado (todos os settlements)
    const totalRequested = settlements.reduce(
      (sum, s) => sum + s.amountCents,
      0
    );

    return res.json({
      wallet: {
        availableCents: wallet?.availableBalanceCents ?? 0,
        pendingCents: wallet?.pendingBalanceCents ?? 0,
        totalEarnedCents: wallet?.totalEarnedCents ?? 0,
      },
      settlements: settlements.map((s) => ({
        id: s.id,
        amountCents: s.amountCents,
        status: s.status,
        createdAt: s.createdAt.toISOString(),
        processedAt: s.processedAt?.toISOString() ?? null,
        failureReason: s.failureReason,
      })),
      summary: {
        totalRequestedCents: totalRequested,
        totalCompletedCents: completedSettlements._sum.amountCents ?? 0,
      },
      pixKey: pixKey
        ? {
            type: pixKey.type,
            key: pixKey.key,
            status: (pixKey as any).status,
            verificationSource: (pixKey as any).verificationSource ?? null,
            verifiedAt: (pixKey as any).verifiedAt ?? null,
            rejectedAt: (pixKey as any).rejectedAt ?? null,
            rejectionReason: (pixKey as any).rejectionReason ?? null,
          }
        : null,
      merchant: {
        name: merchant?.name ?? "Merchant",
        document: merchant?.document ?? "",
      },
    });
  } catch (err) {
    const statusCode = (err as any)?.statusCode ?? 500;
    logger.error({ err }, "Erro em GET /rifeiro/saques");
    return res
      .status(statusCode)
      .json({ error: { code: "INTERNAL_ERROR", message: "Erro interno" } });
  }
});

const createSettlementSchema = z.object({
  amountCents: z.number().int().positive(),
  idempotencyKey: z.string().min(8),
});

/**
 * POST /rifeiro/saques
 * Solicitar saque da carteira do Rifeiro
 */
rifeiroSaquesRouter.post("/", async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({
        error: { code: "UNAUTHORIZED", message: "Usuário não autenticado" },
      });
    }

    const merchantId = await ensureMerchantId(req.user.id);
    await assertRifeiro(merchantId);

    const payload = createSettlementSchema.parse(req.body);

    // Verificar se já existe settlement com esta chave de idempotência
    const existing = await prisma.settlement.findFirst({
      where: {
        merchantId,
        metadata: {
          path: ["idempotencyKey"],
          equals: payload.idempotencyKey,
        },
      },
    });

    if (existing) {
      return res.json({
        id: existing.id,
        merchantId: existing.merchantId,
        amountCents: existing.amountCents,
        status: existing.status,
        createdAt: existing.createdAt.toISOString(),
      });
    }

    // Verificar saldo disponível
    const wallet = await prisma.wallet.findUnique({
      where: { merchantId },
      select: { id: true, availableBalanceCents: true },
    });

    if (!wallet || wallet.availableBalanceCents < payload.amountCents) {
      return res.status(400).json({
        error: {
          code: "INSUFFICIENT_BALANCE",
          message: "Saldo insuficiente para saque",
        },
      });
    }

    // Verificar se tem BankAccount cadastrada
    const bankAccount = await prisma.bankAccount.findUnique({
      where: { merchantId },
      select: { id: true },
    });

    if (!bankAccount) {
      return res.status(400).json({
        error: {
          code: "BANK_ACCOUNT_REQUIRED",
          message: "Cadastre uma conta bancária antes de solicitar saque",
        },
      });
    }

    // Criar settlement
    const settlementRepository = new PrismaSettlementRepository(prisma);
    const messaging = MessagingFactory.create();
    const useCase = new CreateSettlement(settlementRepository, messaging);

    const { settlement } = await useCase.execute({
      merchantId,
      amountCents: payload.amountCents,
      currency: "BRL",
      bankAccountId: bankAccount.id,
      metadata: {
        idempotencyKey: payload.idempotencyKey,
        requestedBy: req.user.id,
        type: "RIFEIRO_WITHDRAWAL",
      },
    });

    // Debitar da wallet
    await prisma.wallet.update({
      where: { merchantId },
      data: {
        availableBalanceCents: {
          decrement: payload.amountCents,
        },
      },
    });

    // Criar WalletTransaction para auditoria
    await prisma.walletTransaction.create({
      data: {
        walletId: wallet.id,
        type: "DEBIT",
        status: "PENDING",
        amountCents: payload.amountCents,
        description: `Solicitação de saque - Settlement ${settlement.id}`,
        referenceId: settlement.id,
        metadata: {
          settlementId: settlement.id,
          idempotencyKey: payload.idempotencyKey,
        },
      },
    });

    return res.status(201).json({
      id: settlement.id,
      merchantId: settlement.merchantId,
      amountCents: settlement.amountCents,
      status: settlement.status,
      createdAt: settlement.createdAt.toISOString(),
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
    logger.error({ err }, "Erro em POST /rifeiro/saques");
    return res
      .status(statusCode)
      .json({ error: { code: "INTERNAL_ERROR", message: "Erro interno" } });
  }
});

/**
 * GET /rifeiro/saques/:id
 * Obter detalhes de um saque
 */
rifeiroSaquesRouter.get("/:id", async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({
        error: { code: "UNAUTHORIZED", message: "Usuário não autenticado" },
      });
    }

    const merchantId = await ensureMerchantId(req.user.id);
    await assertRifeiro(merchantId);

    const settlement = await prisma.settlement.findFirst({
      where: {
        id: req.params.id,
        merchantId, // Garantir que o settlement pertence ao merchant
      },
    });

    if (!settlement) {
      return res.status(404).json({
        error: { code: "NOT_FOUND", message: "Saque não encontrado" },
      });
    }

    return res.json({
      id: settlement.id,
      merchantId: settlement.merchantId,
      amountCents: settlement.amountCents,
      status: settlement.status,
      createdAt: settlement.createdAt.toISOString(),
      processedAt: settlement.processedAt?.toISOString() ?? null,
      failureReason: settlement.failureReason,
      metadata: settlement.metadata,
    });
  } catch (err) {
    const statusCode = (err as any)?.statusCode ?? 500;
    logger.error({ err }, "Erro em GET /rifeiro/saques/:id");
    return res
      .status(statusCode)
      .json({ error: { code: "INTERNAL_ERROR", message: "Erro interno" } });
  }
});
