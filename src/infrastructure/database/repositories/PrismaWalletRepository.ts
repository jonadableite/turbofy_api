import { WalletRepository } from "../../../ports/repositories/WalletRepository";
import { Wallet } from "../../../domain/entities/Wallet";
import { prisma } from "../prismaClient";

export class PrismaWalletRepository implements WalletRepository {
  async findByMerchantId(merchantId: string): Promise<Wallet | null> {
    const record = await prisma.wallet.findUnique({
      where: { merchantId },
    });

    if (!record) {
      return null;
    }

    return this.toDomain(record);
  }

  async create(wallet: Wallet): Promise<Wallet> {
    const record = await prisma.wallet.create({
      data: {
        id: wallet.id,
        merchantId: wallet.merchantId,
        availableBalanceCents: wallet.availableBalanceCents,
        pendingBalanceCents: wallet.pendingBalanceCents,
        totalEarnedCents: wallet.totalEarnedCents,
        currency: wallet.currency,
      },
    });

    return this.toDomain(record);
  }

  async update(wallet: Wallet): Promise<Wallet> {
    const record = await prisma.wallet.update({
      where: { id: wallet.id },
      data: {
        availableBalanceCents: wallet.availableBalanceCents,
        pendingBalanceCents: wallet.pendingBalanceCents,
        totalEarnedCents: wallet.totalEarnedCents,
        updatedAt: new Date(),
      },
    });

    return this.toDomain(record);
  }

  private toDomain(record: {
    id: string;
    merchantId: string;
    availableBalanceCents: number;
    pendingBalanceCents: number;
    totalEarnedCents: number;
    currency: string;
    createdAt: Date;
    updatedAt: Date;
  }): Wallet {
    const wallet = new Wallet({
      id: record.id,
      merchantId: record.merchantId,
      availableBalanceCents: record.availableBalanceCents,
      pendingBalanceCents: record.pendingBalanceCents,
      totalEarnedCents: record.totalEarnedCents,
      currency: record.currency,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });

    return wallet;
  }
}

