import { PrismaClient } from "@prisma/client";
import {
  Payment,
  PaymentMethod,
  PaymentStatus,
} from "../../../domain/entities/Payment";
import { PaymentRepository } from "../../../ports/repositories/PaymentRepository";

export class PrismaPaymentRepository implements PaymentRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async save(payment: Payment): Promise<Payment> {
    const data = {
      id: payment.id,
      amount: payment.amount,
      description: payment.description,
      merchantId: payment.merchantId,
      status: payment.status,
      method: payment.method,
      customerEmail: payment.customerEmail,
      customerName: payment.customerName,
      customerDocument: payment.customerDocument,
      expiresAt: payment.expiresAt,
      metadata: payment.metadata as any,
    };

    const savedPayment = await this.prisma.payment.create({
      data,
    });

    return this.mapToEntity(savedPayment);
  }

  async findById(id: string): Promise<Payment | null> {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
    });

    if (!payment) return null;

    return this.mapToEntity(payment);
  }

  async findByMerchantId(
    merchantId: string,
    options?: {
      limit?: number;
      offset?: number;
      status?: PaymentStatus;
    }
  ): Promise<Payment[]> {
    const { limit = 10, offset = 0, status } = options || {};

    const payments = await this.prisma.payment.findMany({
      where: {
        merchantId,
        ...(status ? { status } : {}),
      },
      take: limit,
      skip: offset,
      orderBy: {
        createdAt: "desc",
      },
    });

    return payments.map(this.mapToEntity);
  }

  async update(payment: Payment): Promise<Payment> {
    const updatedPayment = await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: payment.status,
        updatedAt: new Date(),
      },
    });

    return this.mapToEntity(updatedPayment);
  }

  async countByMerchantId(
    merchantId: string,
    options?: { status?: PaymentStatus }
  ): Promise<number> {
    const { status } = options || {};

    return this.prisma.payment.count({
      where: {
        merchantId,
        ...(status ? { status } : {}),
      },
    });
  }

  private mapToEntity(prismaPayment: any): Payment {
    return new Payment({
      id: prismaPayment.id,
      amount: Number(prismaPayment.amount),
      description: prismaPayment.description,
      merchantId: prismaPayment.merchantId,
      status: prismaPayment.status as PaymentStatus,
      method: prismaPayment.method as PaymentMethod,
      customerEmail: prismaPayment.customerEmail,
      customerName: prismaPayment.customerName,
      customerDocument: prismaPayment.customerDocument,
      createdAt: prismaPayment.createdAt,
      updatedAt: prismaPayment.updatedAt,
      expiresAt: prismaPayment.expiresAt,
      metadata: prismaPayment.metadata,
    });
  }
}
