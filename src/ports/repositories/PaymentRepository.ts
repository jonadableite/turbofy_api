import { Payment, PaymentStatus } from "../../domain/entities/Payment";

export interface PaymentRepository {
  save(payment: Payment): Promise<Payment>;
  findById(id: string): Promise<Payment | null>;
  findByMerchantId(
    merchantId: string,
    options?: {
      limit?: number;
      offset?: number;
      status?: PaymentStatus;
    }
  ): Promise<Payment[]>;
  update(payment: Payment): Promise<Payment>;
  countByMerchantId(
    merchantId: string,
    options?: { status?: PaymentStatus }
  ): Promise<number>;
}
