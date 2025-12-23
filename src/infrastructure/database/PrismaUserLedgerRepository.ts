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
    const entries = await prisma.userLedgerEntry.findMany({
      where: { userId },
    });
    return entries.map(mapLedger);
  }

  async createMany(
    entries: Array<Omit<UserLedgerEntryRecord, "id" | "createdAt">>
  ): Promise<UserLedgerEntryRecord[]> {
    const created = await Promise.all(
      entries.map((entry) =>
        prisma.userLedgerEntry.create({
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
        })
      )
    );
    return created.map(mapLedger);
  }

  async updateStatus(params: { ids: string[]; status: string }): Promise<void> {
    if (params.ids.length === 0) return;
    await prisma.userLedgerEntry.updateMany({
      where: { id: { in: params.ids } },
      data: { status: params.status },
    });
  }
}

