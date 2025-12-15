import { Reconciliation, ReconciliationStatus } from "../domain/entities/Reconciliation";

export interface ReconciliationRepository {
  findById(id: string): Promise<Reconciliation | null>;
  findByMerchantId(merchantId: string, status?: ReconciliationStatus): Promise<Reconciliation[]>;
  findByDateRange(merchantId: string, startDate: Date, endDate: Date): Promise<Reconciliation[]>;
  create(reconciliation: Reconciliation): Promise<Reconciliation>;
  update(reconciliation: Reconciliation): Promise<Reconciliation>;
}

