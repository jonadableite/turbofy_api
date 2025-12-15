import { WalletTransactionRepository } from '../../../ports/repositories/WalletTransactionRepository';
import {
  WalletTransaction,
  WalletTransactionType,
  WalletTransactionStatus,
} from '../../../domain/entities/WalletTransaction';
import { prisma } from '../prismaClient';
import {
  WalletTransactionType as PrismaWalletTransactionType,
  WalletTransactionStatus as PrismaWalletTransactionStatus,
} from '@prisma/client';

export class PrismaWalletTransactionRepository
  implements WalletTransactionRepository
{
  async create(
    transaction: WalletTransaction
  ): Promise<WalletTransaction> {
    const record = await prisma.walletTransaction.create({
      data: {
        id: transaction.id,
        walletId: transaction.walletId,
        type: this.toPrismaType(transaction.type),
        amountCents: transaction.amountCents,
        status: this.toPrismaStatus(transaction.status),
        description: transaction.description,
        referenceId: transaction.referenceId,
        metadata: (transaction.metadata ?? null) as any,
        processedAt: transaction.processedAt,
      },
    });

    return this.toDomain(record);
  }

  async findByWalletId(
    walletId: string,
    filters?: {
      type?: WalletTransactionType;
      status?: WalletTransactionStatus;
      limit?: number;
      offset?: number;
    }
  ): Promise<WalletTransaction[]> {
    const records = await prisma.walletTransaction.findMany({
      where: {
        walletId,
        ...(filters?.type && {
          type: this.toPrismaType(filters.type),
        }),
        ...(filters?.status && {
          status: this.toPrismaStatus(filters.status),
        }),
      },
      orderBy: { createdAt: 'desc' },
      take: filters?.limit,
      skip: filters?.offset,
    });

    return records.map((r) => this.toDomain(r));
  }

  async findByReferenceId(
    referenceId: string
  ): Promise<WalletTransaction | null> {
    const record = await prisma.walletTransaction.findFirst({
      where: { referenceId },
    });

    if (!record) {
      return null;
    }

    return this.toDomain(record);
  }

  async update(
    transaction: WalletTransaction
  ): Promise<WalletTransaction> {
    const record = await prisma.walletTransaction.update({
      where: { id: transaction.id },
      data: {
        status: this.toPrismaStatus(transaction.status),
        processedAt: transaction.processedAt,
        updatedAt: new Date(),
      },
    });

    return this.toDomain(record);
  }

  private toDomain(record: {
    id: string;
    walletId: string;
    type: PrismaWalletTransactionType;
    amountCents: number;
    status: PrismaWalletTransactionStatus;
    description: string | null;
    referenceId: string | null;
    metadata: any;
    processedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): WalletTransaction {
    return new WalletTransaction({
      id: record.id,
      walletId: record.walletId,
      type: this.toDomainType(record.type),
      amountCents: record.amountCents,
      status: this.toDomainStatus(record.status),
      description: record.description ?? undefined,
      referenceId: record.referenceId ?? undefined,
      metadata: record.metadata,
      processedAt: record.processedAt ?? undefined,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }

  private toPrismaType(
    type: WalletTransactionType
  ): PrismaWalletTransactionType {
    const map: Record<
      WalletTransactionType,
      PrismaWalletTransactionType
    > = {
      [WalletTransactionType.CREDIT]:
        PrismaWalletTransactionType.CREDIT,
      [WalletTransactionType.DEBIT]:
        PrismaWalletTransactionType.DEBIT,
      [WalletTransactionType.SETTLEMENT]:
        PrismaWalletTransactionType.SETTLEMENT,
      [WalletTransactionType.REFUND]:
        PrismaWalletTransactionType.REFUND,
      [WalletTransactionType.FEE]: PrismaWalletTransactionType.FEE,
    };
    return map[type];
  }

  private toDomainType(
    type: PrismaWalletTransactionType
  ): WalletTransactionType {
    const map: Record<
      PrismaWalletTransactionType,
      WalletTransactionType
    > = {
      [PrismaWalletTransactionType.CREDIT]:
        WalletTransactionType.CREDIT,
      [PrismaWalletTransactionType.DEBIT]:
        WalletTransactionType.DEBIT,
      [PrismaWalletTransactionType.SETTLEMENT]:
        WalletTransactionType.SETTLEMENT,
      [PrismaWalletTransactionType.REFUND]:
        WalletTransactionType.REFUND,
      [PrismaWalletTransactionType.FEE]: WalletTransactionType.FEE,
    };
    return map[type];
  }

  private toPrismaStatus(
    status: WalletTransactionStatus
  ): PrismaWalletTransactionStatus {
    const map: Record<
      WalletTransactionStatus,
      PrismaWalletTransactionStatus
    > = {
      [WalletTransactionStatus.PENDING]:
        PrismaWalletTransactionStatus.PENDING,
      [WalletTransactionStatus.COMPLETED]:
        PrismaWalletTransactionStatus.COMPLETED,
      [WalletTransactionStatus.FAILED]:
        PrismaWalletTransactionStatus.FAILED,
      [WalletTransactionStatus.CANCELLED]:
        PrismaWalletTransactionStatus.CANCELLED,
    };
    return map[status];
  }

  private toDomainStatus(
    status: PrismaWalletTransactionStatus
  ): WalletTransactionStatus {
    const map: Record<
      PrismaWalletTransactionStatus,
      WalletTransactionStatus
    > = {
      [PrismaWalletTransactionStatus.PENDING]:
        WalletTransactionStatus.PENDING,
      [PrismaWalletTransactionStatus.COMPLETED]:
        WalletTransactionStatus.COMPLETED,
      [PrismaWalletTransactionStatus.FAILED]:
        WalletTransactionStatus.FAILED,
      [PrismaWalletTransactionStatus.CANCELLED]:
        WalletTransactionStatus.CANCELLED,
    };
    return map[status];
  }
}
