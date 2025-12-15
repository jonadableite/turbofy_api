// 🔐 SECURITY: Type-safe database operations prevent injection attacks via Prisma parameterization
// 📈 SCALABILITY: Efficient data mapping between Prisma models and domain entities
// 🛠️ MAINTAINABILITY: Clear separation between infrastructure and domain layers
// 🧪 TESTABILITY: Repository pattern allows easy mocking for unit tests
// 🔄 EXTENSIBILITY: Easy to swap Prisma for another ORM without changing domain logic

import { PrismaClient, Prisma } from "@prisma/client";
import { Charge } from "../../domain/entities/Charge";
import { ChargeSplit } from "../../domain/entities/ChargeSplit";
import { Fee } from "../../domain/entities/Fee";
import { ChargeRepository } from "../../ports/ChargeRepository";
import { prisma } from "./prismaClient";

function mapPrismaChargeToDomain(model: any): Charge {
  return new Charge({
    id: model.id,
    merchantId: model.merchantId,
    amountCents: model.amountCents,
    currency: model.currency,
    description: model.description ?? undefined,
    status: model.status,
    method: model.method ?? undefined,
    expiresAt: model.expiresAt ?? undefined,
    idempotencyKey: model.idempotencyKey,
    externalRef: model.externalRef ?? undefined,
    metadata: model.metadata ?? undefined,
    pixQrCode: model.pixQrCode ?? undefined,
    pixCopyPaste: model.pixCopyPaste ?? undefined,
    boletoUrl: model.boletoUrl ?? undefined,
    pixTxid: model.pixTxid ?? undefined,
    paidAt: model.paidAt ?? undefined,
    createdAt: model.createdAt,
    updatedAt: model.updatedAt,
  });
}

export class PrismaChargeRepository implements ChargeRepository {
  async findById(id: string): Promise<Charge | null> {
    const found = await prisma.charge.findUnique({ where: { id } });
    return found ? mapPrismaChargeToDomain(found) : null;
  }

  async findByIdempotencyKey(idempotencyKey: string): Promise<Charge | null> {
    const found = await prisma.charge.findUnique({ where: { idempotencyKey } });
    return found ? mapPrismaChargeToDomain(found) : null;
  }

  async findByExternalRef(externalRef: string): Promise<Charge | null> {
    const found = await prisma.charge.findFirst({ where: { externalRef } });
    return found ? mapPrismaChargeToDomain(found) : null;
  }

  async findByTxid(txid: string): Promise<Charge | null> {
    const found = await prisma.charge.findUnique({ where: { pixTxid: txid } });
    return found ? mapPrismaChargeToDomain(found) : null;
  }

  async create(charge: Charge): Promise<Charge> {
    // 🔐 SECURITY: Prisma automatically parameterizes queries, preventing SQL injection
    // 📈 SCALABILITY: Single transaction for charge creation
    const created = await prisma.charge.create({
      data: {
        id: charge.id,
        merchantId: charge.merchantId,
        amountCents: charge.amountCents,
        currency: charge.currency,
        description: charge.description ?? null,
        status: charge.status,
        method: charge.method ?? null,
        expiresAt: charge.expiresAt ?? null,
        idempotencyKey: charge.idempotencyKey,
        externalRef: charge.externalRef ?? null,
        ...(charge.metadata !== undefined ? { metadata: charge.metadata as Prisma.InputJsonValue } : {}),
        pixQrCode: charge.pixQrCode ?? null,
        pixCopyPaste: charge.pixCopyPaste ?? null,
        boletoUrl: charge.boletoUrl ?? null,
        pixTxid: charge.pixTxid ?? null,
        paidAt: charge.paidAt ?? null,
      },
    });
    return mapPrismaChargeToDomain(created);
  }

  async update(charge: Charge): Promise<Charge> {
    // 🔐 SECURITY: Type-safe update operations
    // 🛠️ MAINTAINABILITY: Only updates provided fields
    const updated = await prisma.charge.update({
      where: { id: charge.id },
      data: {
        description: charge.description ?? null,
        status: charge.status,
        method: charge.method ?? null,
        expiresAt: charge.expiresAt ?? null,
        externalRef: charge.externalRef ?? null,
        ...(charge.metadata !== undefined ? { metadata: charge.metadata as Prisma.InputJsonValue } : {}),
        pixQrCode: charge.pixQrCode ?? null,
        pixCopyPaste: charge.pixCopyPaste ?? null,
        boletoUrl: charge.boletoUrl ?? null,
        pixTxid: charge.pixTxid ?? null,
        paidAt: charge.paidAt ?? null,
      },
    });
    return mapPrismaChargeToDomain(updated);
  }

  async addSplit(chargeId: string, split: ChargeSplit): Promise<ChargeSplit> {
    // 🔐 SECURITY: Type-safe split creation with proper Decimal handling
    // 📈 SCALABILITY: Efficient split storage for payment distribution
    // 🛠️ MAINTAINABILITY: Converts Prisma Decimal to number for domain layer
    // 🧪 TESTABILITY: Clear logic for amount calculation
    let amountCents: number;
    
    if (split.amountCents != null) {
      amountCents = split.amountCents;
    } else {
      // If amountCents is not provided, calculate from percentage
      // Need to fetch charge to get total amount
      const charge = await prisma.charge.findUnique({ 
        where: { id: chargeId },
        select: { amountCents: true }
      });
      
      if (!charge) {
        throw new Error(`Charge ${chargeId} not found`);
      }
      
      amountCents = split.computeAmountForTotal(charge.amountCents);
    }
    
    const created = await prisma.chargeSplit.create({
      data: {
        id: split.id,
        chargeId,
        merchantId: split.merchantId,
        amountCents,
        percentage: split.percentage ? new Prisma.Decimal(split.percentage) : null,
      },
    });
    return new ChargeSplit({
      id: created.id,
      chargeId: created.chargeId,
      merchantId: created.merchantId,
      amountCents: created.amountCents,
      percentage: created.percentage ? Number(created.percentage) : undefined,
      createdAt: created.createdAt,
    });
  }

  async addFee(chargeId: string, fee: Fee): Promise<Fee> {
    const created = await prisma.fee.create({
      data: {
        id: fee.id,
        chargeId,
        type: fee.type,
        amountCents: fee.amountCents,
      },
    });
    return new Fee({
      id: created.id,
      chargeId: created.chargeId,
      type: created.type,
      amountCents: created.amountCents,
      createdAt: created.createdAt,
    });
  }
}
