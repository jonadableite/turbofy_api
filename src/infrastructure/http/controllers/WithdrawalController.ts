import { Request, Response } from "express";
import { z } from "zod";
import { PrismaUserLedgerRepository } from "../../database/PrismaUserLedgerRepository";
import { PrismaUserPixKeyRepository } from "../../database/PrismaUserPixKeyRepository";
import { PrismaWithdrawalRepository } from "../../database/PrismaWithdrawalRepository";
import { RequestWithdrawalUseCase } from "../../../application/useCases/balance/RequestWithdrawalUseCase";
import { GetBalanceUseCase } from "../../../application/useCases/balance/GetBalanceUseCase";
import { ProcessWithdrawalUseCase } from "../../../application/useCases/balance/ProcessWithdrawalUseCase";
import { logger } from "../../logger";
import { prisma } from "../../database/prismaClient";
import { WithdrawalStatus } from "../../../domain/entities/WithdrawalStatus";

const ledgerRepository = new PrismaUserLedgerRepository();
const pixKeyRepository = new PrismaUserPixKeyRepository();
const withdrawalRepository = new PrismaWithdrawalRepository();

const requestWithdrawal = new RequestWithdrawalUseCase(
  ledgerRepository,
  pixKeyRepository,
  withdrawalRepository
);
const getBalance = new GetBalanceUseCase(ledgerRepository);
const processWithdrawal = new ProcessWithdrawalUseCase(
  ledgerRepository,
  pixKeyRepository,
  withdrawalRepository
);

const requestSchema = z.object({
  amountCents: z.number().int().positive().min(100, "Minimum withdrawal amount is R$ 1.00"),
  idempotencyKey: z.string().min(8, "Idempotency key must have at least 8 characters"),
});

const listSchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(10),
  status: z.string().optional(),
});

const cancelSchema = z.object({
  reason: z.string().optional(),
});

export class WithdrawalController {
  async create(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ 
          error: "UNAUTHORIZED", 
          message: "User not authenticated" 
        });
      }

      const body = requestSchema.parse(req.body);

      logger.info(
        { userId, amountCents: body.amountCents, idempotencyKey: body.idempotencyKey },
        "Creating withdrawal request"
      );

      const withdrawal = await requestWithdrawal.execute({
        userId,
        amountCents: body.amountCents,
        idempotencyKey: body.idempotencyKey,
      });

      // Buscar saldo atualizado após o saque
      const updatedBalance = await getBalance.execute({ userId });

      logger.info(
        { userId, withdrawalId: withdrawal.id, status: withdrawal.status },
        "Withdrawal request created successfully"
      );

      return res.status(201).json({
        withdrawal,
        updatedBalance,
      });
    } catch (error) {
      logger.error({ error, userId: req.user?.id }, "Error creating withdrawal");

      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          error: "VALIDATION_ERROR", 
          message: "Invalid input data",
          details: error.issues 
        });
      }

      const errorMessage = error instanceof Error ? error.message : "Unknown error";

      if (errorMessage.includes("KYC not approved")) {
        return res.status(403).json({ 
          error: "KYC_NOT_APPROVED", 
          message: "KYC must be approved before requesting withdrawal" 
        });
      }

      if (errorMessage.includes("Pix key not verified")) {
        return res.status(400).json({ 
          error: "PIX_KEY_NOT_VERIFIED", 
          message: errorMessage 
        });
      }

      if (errorMessage.includes("Insufficient balance")) {
        return res.status(400).json({ 
          error: "INSUFFICIENT_BALANCE", 
          message: errorMessage 
        });
      }

      if (errorMessage.includes("already exists")) {
        return res.status(409).json({ 
          error: "DUPLICATE_WITHDRAWAL", 
          message: "A withdrawal with this idempotency key already exists" 
        });
      }

      return res.status(400).json({ 
        error: "WITHDRAWAL_REQUEST_FAILED", 
        message: errorMessage 
      });
    }
  }

  async get(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ 
          error: "UNAUTHORIZED", 
          message: "User not authenticated" 
        });
      }

      const id = req.params.id;
      const withdrawal = await withdrawalRepository.findById(id);

      if (!withdrawal || withdrawal.userId !== userId) {
        return res.status(404).json({ 
          error: "WITHDRAWAL_NOT_FOUND", 
          message: "Withdrawal not found" 
        });
      }

      return res.json(withdrawal);
    } catch (error) {
      logger.error({ error, userId: req.user?.id }, "Error fetching withdrawal");
      return res.status(500).json({ 
        error: "INTERNAL_SERVER_ERROR", 
        message: "Error fetching withdrawal" 
      });
    }
  }

  async history(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ 
          error: "UNAUTHORIZED", 
          message: "User not authenticated" 
        });
      }
      
      const params = listSchema.parse(req.query);
      
      const [balance, result] = await Promise.all([
        getBalance.execute({ userId }),
        withdrawalRepository.findByUserId({
          userId,
          page: params.page,
          limit: params.limit,
          status: params.status,
        }),
      ]);

      return res.json({
        balance,
        withdrawals: result.withdrawals,
        pagination: {
          total: result.total,
          page: result.page,
          limit: result.limit,
          totalPages: result.totalPages,
        },
      });
    } catch (error) {
      logger.error({ error, userId: req.user?.id }, "Error fetching withdrawal history");

      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          error: "VALIDATION_ERROR", 
          message: "Invalid query parameters",
          details: error.issues 
        });
      }

      return res.status(500).json({ 
        error: "INTERNAL_SERVER_ERROR", 
        message: "Error fetching withdrawal history" 
      });
    }
  }

  async getUserInfo(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ 
          error: "UNAUTHORIZED", 
          message: "User not authenticated" 
        });
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          document: true,
          documentType: true,
          kycStatus: true,
          merchantId: true,
          merchant: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      if (!user) {
        return res.status(404).json({ 
          error: "USER_NOT_FOUND", 
          message: "User not found" 
        });
      }

      const merchantName = user.merchant?.name || user.email.split("@")[0];

      const [pixKey, balance] = await Promise.all([
        pixKeyRepository.findByUserId(userId),
        getBalance.execute({ userId }),
      ]);

      return res.json({
        user: {
          id: user.id,
          email: user.email,
          document: user.document,
          documentType: user.documentType,
          kycStatus: user.kycStatus,
          merchantName,
        },
        pixKey: pixKey
          ? {
              type: pixKey.type,
              key: pixKey.key,
              status: pixKey.status,
              verificationSource: pixKey.verificationSource,
              verifiedAt: pixKey.verifiedAt,
              rejectedAt: pixKey.rejectedAt,
              rejectionReason: pixKey.rejectionReason,
            }
          : null,
        balance,
      });
    } catch (error) {
      logger.error({ error, userId: req.user?.id }, "Error fetching user info for withdrawal");
      return res.status(500).json({ 
        error: "INTERNAL_SERVER_ERROR", 
        message: "Error fetching user info" 
      });
    }
  }

  async cancel(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ 
          error: "UNAUTHORIZED", 
          message: "User not authenticated" 
        });
      }

      const id = req.params.id;
      const body = cancelSchema.parse(req.body);

      const withdrawal = await withdrawalRepository.findById(id);

      if (!withdrawal || withdrawal.userId !== userId) {
        return res.status(404).json({ 
          error: "WITHDRAWAL_NOT_FOUND", 
          message: "Withdrawal not found" 
        });
      }

      if (withdrawal.status !== WithdrawalStatus.REQUESTED) {
        return res.status(400).json({ 
          error: "WITHDRAWAL_CANNOT_BE_CANCELED", 
          message: "Only withdrawals with REQUESTED status can be canceled" 
        });
      }

      logger.info(
        { userId, withdrawalId: id, reason: body.reason },
        "Canceling withdrawal"
      );

      const updated = await withdrawalRepository.update({
        ...withdrawal,
        status: WithdrawalStatus.CANCELED,
        failureReason: body.reason ?? "Canceled by user",
      });

      // Reverter entries do ledger
      const pendingEntries = (await ledgerRepository.getEntriesForUser(userId)).filter(
        (entry) => entry.referenceId === withdrawal.id
      );

      await ledgerRepository.updateStatus({
        ids: pendingEntries.map((e) => e.id),
        status: "CANCELED",
      });

      const updatedBalance = await getBalance.execute({ userId });

      logger.info(
        { userId, withdrawalId: id },
        "Withdrawal canceled successfully"
      );

      return res.json({
        withdrawal: updated,
        updatedBalance,
      });
    } catch (error) {
      logger.error({ error, userId: req.user?.id, withdrawalId: req.params.id }, "Error canceling withdrawal");

      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          error: "VALIDATION_ERROR", 
          message: "Invalid input data",
          details: error.issues 
        });
      }

      return res.status(500).json({ 
        error: "INTERNAL_SERVER_ERROR", 
        message: "Error canceling withdrawal" 
      });
    }
  }

  async process(req: Request, res: Response) {
    try {
      const adminId = req.user?.id;
      if (!adminId || !req.user?.roles?.includes("ADMIN")) {
        return res.status(403).json({ 
          error: "FORBIDDEN", 
          message: "Only admins can process withdrawals" 
        });
      }

      const id = req.params.id;

      logger.info(
        { adminId, withdrawalId: id },
        "Processing withdrawal (admin action)"
      );

      const withdrawal = await processWithdrawal.execute({ withdrawalId: id });

      logger.info(
        { adminId, withdrawalId: id, status: withdrawal.status },
        "Withdrawal processed"
      );

      return res.json(withdrawal);
    } catch (error) {
      logger.error({ error, adminId: req.user?.id, withdrawalId: req.params.id }, "Error processing withdrawal");

      const errorMessage = error instanceof Error ? error.message : "Unknown error";

      if (errorMessage.includes("not found")) {
        return res.status(404).json({ 
          error: "WITHDRAWAL_NOT_FOUND", 
          message: errorMessage 
        });
      }

      return res.status(500).json({ 
        error: "WITHDRAWAL_PROCESSING_FAILED", 
        message: errorMessage 
      });
    }
  }
}

