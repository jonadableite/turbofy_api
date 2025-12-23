import { prisma } from "./prismaClient";
import {
  WithdrawalRecord,
  WithdrawalRepositoryPort,
  WithdrawalListParams,
  WithdrawalListResult,
} from "../../ports/WithdrawalRepositoryPort";

const mapWithdrawal = (withdrawal: {
  id: string;
  userId: string;
  amountCents: number;
  feeCents: number;
  totalDebitedCents: number;
  status: string;
  transferaTxId: string | null;
  failureReason: string | null;
  idempotencyKey: string;
  createdAt: Date;
  processedAt: Date | null;
  version: number;
}): WithdrawalRecord => ({
  id: withdrawal.id,
  userId: withdrawal.userId,
  amountCents: withdrawal.amountCents,
  feeCents: withdrawal.feeCents,
  totalDebitedCents: withdrawal.totalDebitedCents,
  status: withdrawal.status,
  transferaTxId: withdrawal.transferaTxId,
  failureReason: withdrawal.failureReason,
  idempotencyKey: withdrawal.idempotencyKey,
  createdAt: withdrawal.createdAt,
  processedAt: withdrawal.processedAt,
  version: withdrawal.version,
});

export class PrismaWithdrawalRepository implements WithdrawalRepositoryPort {
  async findById(id: string): Promise<WithdrawalRecord | null> {
    const prismaAny = prisma as any;
    const withdrawal = await prismaAny.withdrawal.findUnique({ where: { id } } as any);
    return withdrawal ? mapWithdrawal(withdrawal) : null;
  }

  async findByIdempotencyKey(
    userId: string,
    idempotencyKey: string
  ): Promise<WithdrawalRecord | null> {
    const prismaAny = prisma as any;
    const withdrawal = await prismaAny.withdrawal.findUnique({
      where: { userId_idempotencyKey: { userId, idempotencyKey } },
    } as any);
    return withdrawal ? mapWithdrawal(withdrawal) : null;
  }

  async findByTransferaTxId(transferaTxId: string): Promise<WithdrawalRecord | null> {
    const prismaAny = prisma as any;
    const withdrawal = await prismaAny.withdrawal.findFirst({
      where: { transferaTxId },
    } as any);
    return withdrawal ? mapWithdrawal(withdrawal) : null;
  }

  async findByUserId(params: WithdrawalListParams): Promise<WithdrawalListResult> {
    const page = params.page ?? 1;
    const limit = Math.min(params.limit ?? 10, 100);
    const skip = (page - 1) * limit;

    const where: { userId: string; status?: string } = { userId: params.userId };
    if (params.status) {
      where.status = params.status;
    }

    const [withdrawals, total] = await Promise.all([
      (prisma as any).withdrawal.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      } as any),
      (prisma as any).withdrawal.count({ where } as any),
    ]);

    return {
      withdrawals: withdrawals.map(mapWithdrawal),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async create(
    input: Omit<
      WithdrawalRecord,
      "createdAt" | "processedAt" | "transferaTxId" | "failureReason"
    >
  ): Promise<WithdrawalRecord> {
    const prismaAny = prisma as any;
    const created = await prismaAny.withdrawal.create({
      data: {
        id: input.id,
        userId: input.userId,
        amountCents: input.amountCents,
        feeCents: input.feeCents,
        totalDebitedCents: input.totalDebitedCents,
        status: input.status,
        idempotencyKey: input.idempotencyKey,
        version: input.version,
      },
    } as any);
    return mapWithdrawal(created);
  }

  async update(withdrawal: WithdrawalRecord): Promise<WithdrawalRecord> {
    const prismaAny = prisma as any;
    const updated = await prismaAny.withdrawal.update({
      where: { id: withdrawal.id },
      data: {
        amountCents: withdrawal.amountCents,
        feeCents: withdrawal.feeCents,
        totalDebitedCents: withdrawal.totalDebitedCents,
        status: withdrawal.status,
        transferaTxId: withdrawal.transferaTxId,
        failureReason: withdrawal.failureReason,
        idempotencyKey: withdrawal.idempotencyKey,
        processedAt: withdrawal.processedAt,
        version: withdrawal.version,
      },
    } as any);
    return mapWithdrawal(updated);
  }
}

