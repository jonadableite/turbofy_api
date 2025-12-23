import { prisma } from "./prismaClient";
import {
  UserLedgerEntryRecord,
  UserLedgerRepositoryPort,
} from "../../ports/UserLedgerRepositoryPort";

const mapLedger = (entry: any): UserLedgerEntryRecord => ({
  id: entry.id,
  userId: entry.userId,
  type: entry.type,
  status: entry.status,
  amountCents: entry.amountCents,
  isCredit: entry.isCredit,
  referenceType: entry.referenceType,
  referenceId: entry.referenceId,
  occurredAt: entry.occurredAt,
  createdAt: entry.createdAt,
});

export class PrismaUserLedgerRepository implements UserLedgerRepositoryPort {
  async getEntriesForUser(userId: string): Promise<UserLedgerEntryRecord[]> {
    const prismaAny = prisma as any;
    const entries = await prismaAny.userLedgerEntry.findMany({
      where: { userId },
    } as any);
    return entries.map(mapLedger);
  }

  async createMany(
    entries: Array<Omit<UserLedgerEntryRecord, "id" | "createdAt">>
  ): Promise<UserLedgerEntryRecord[]> {
    const prismaAny = prisma as any;
    const created = await Promise.all(
      entries.map((entry) =>
        prismaAny.userLedgerEntry.create({
          data: {
            userId: entry.userId,
            type: entry.type,
            status: entry.status,
            amountCents: entry.amountCents,
            isCredit: entry.isCredit,
            referenceType: entry.referenceType,
            referenceId: entry.referenceId,
            occurredAt: entry.occurredAt,
          },
        } as any)
      )
    );
    return created.map(mapLedger);
  }

  async updateStatus(params: { ids: string[]; status: string }): Promise<void> {
    if (params.ids.length === 0) return;
    const prismaAny = prisma as any;
    await prismaAny.userLedgerEntry.updateMany({
      where: { id: { in: params.ids } },
      data: { status: params.status },
    } as any);
  }
}

