import { Prisma, PrismaClient } from "@prisma/client";
import {
  Reconciliation,
  ReconciliationStatus,
  ReconciliationType,
  ReconciliationMatch,
} from "../../domain/entities/Reconciliation";
import { ReconciliationRepository } from "../../ports/ReconciliationRepository";
// Use constructor-injected PrismaClient for better testability and to avoid global coupling

function mapPrismaReconciliationToDomain(model: any): Reconciliation {
  const rawMatches = Array.isArray(model.matches) ? (model.matches as any[]) : [];
  const matches: ReconciliationMatch[] = rawMatches.map((m: any) => ({
    chargeId: String(m.chargeId),
    amountCents: Number(m.amountCents),
    transactionId: String(m.transactionId),
    matchedAt: new Date(String(m.matchedAt)),
  }));
  const unmatchedCharges: string[] = Array.isArray(model.unmatchedCharges) ? model.unmatchedCharges : [];
  const unmatchedTransactions: string[] = Array.isArray(model.unmatchedTransactions) ? model.unmatchedTransactions : [];

  return new Reconciliation({
    id: model.id,
    merchantId: model.merchantId,
    type: model.type as ReconciliationType,
    status: model.status as ReconciliationStatus,
    startDate: model.startDate,
    endDate: model.endDate,
    matches,
    unmatchedCharges,
    unmatchedTransactions,
    totalAmountCents: model.totalAmountCents,
    matchedAmountCents: model.matchedAmountCents,
    failureReason: model.failureReason ?? undefined,
    processedAt: model.processedAt ?? undefined,
    metadata: model.metadata ? (model.metadata as Record<string, unknown>) : undefined,
    createdAt: model.createdAt,
    updatedAt: model.updatedAt,
  });
}

export class PrismaReconciliationRepository implements ReconciliationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<Reconciliation | null> {
    const found = await this.prisma.reconciliation.findUnique({ where: { id } });
    return found ? mapPrismaReconciliationToDomain(found) : null;
  }

  async findByMerchantId(merchantId: string, status?: ReconciliationStatus): Promise<Reconciliation[]> {
    const found = await this.prisma.reconciliation.findMany({
      where: status ? { merchantId, status } : { merchantId },
      orderBy: { createdAt: "desc" },
    });
    return found.map(mapPrismaReconciliationToDomain);
  }

  async findByDateRange(
    merchantId: string,
    startDate: Date,
    endDate: Date
  ): Promise<Reconciliation[]> {
    const found = await this.prisma.reconciliation.findMany({
      where: {
        merchantId,
        OR: [
          {
            startDate: { lte: endDate },
            endDate: { gte: startDate },
          },
        ],
      },
      orderBy: { createdAt: "desc" },
    });
    return found.map(mapPrismaReconciliationToDomain);
  }

  async create(reconciliation: Reconciliation): Promise<Reconciliation> {
    const created = await this.prisma.reconciliation.create({
      data: {
        id: reconciliation.id,
        merchantId: reconciliation.merchantId,
        type: reconciliation.type,
        status: reconciliation.status,
        startDate: reconciliation.startDate,
        endDate: reconciliation.endDate,
        matches: (reconciliation.matches || []).map(m => ({
          chargeId: m.chargeId,
          amountCents: m.amountCents,
          transactionId: m.transactionId,
          matchedAt: m.matchedAt.toISOString(),
        })) as Prisma.InputJsonValue,
        ...(reconciliation.unmatchedCharges.length
          ? { unmatchedCharges: Array.from(reconciliation.unmatchedCharges) }
          : {}),
        ...(reconciliation.unmatchedTransactions.length
          ? { unmatchedTransactions: Array.from(reconciliation.unmatchedTransactions) }
          : {}),
        totalAmountCents: reconciliation.totalAmountCents,
        matchedAmountCents: reconciliation.matchedAmountCents,
        failureReason: reconciliation.failureReason ?? null,
        processedAt: reconciliation.processedAt ?? null,
        ...(reconciliation.metadata !== undefined
          ? { metadata: reconciliation.metadata as Prisma.InputJsonValue }
          : {}),
      },
    });
    return mapPrismaReconciliationToDomain(created);
  }

  async update(reconciliation: Reconciliation): Promise<Reconciliation> {
    const updated = await this.prisma.reconciliation.update({
      where: { id: reconciliation.id },
      data: {
        status: reconciliation.status,
        matches: (reconciliation.matches || []).map(m => ({
          chargeId: m.chargeId,
          amountCents: m.amountCents,
          transactionId: m.transactionId,
          matchedAt: m.matchedAt.toISOString(),
        })) as Prisma.InputJsonValue,
        unmatchedCharges: Array.from(reconciliation.unmatchedCharges),
        unmatchedTransactions: Array.from(reconciliation.unmatchedTransactions),
        totalAmountCents: reconciliation.totalAmountCents,
        matchedAmountCents: reconciliation.matchedAmountCents,
        failureReason: reconciliation.failureReason ?? null,
        processedAt: reconciliation.processedAt ?? null,
        ...(reconciliation.metadata !== undefined
          ? { metadata: reconciliation.metadata as Prisma.InputJsonValue }
          : {}),
      },
    });
    return mapPrismaReconciliationToDomain(updated);
  }
}

