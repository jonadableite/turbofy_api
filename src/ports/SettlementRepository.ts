import { Settlement, SettlementStatus } from "../domain/entities/Settlement";

export interface SettlementRepository {
  findById(id: string): Promise<Settlement | null>;
  findByMerchantId(merchantId: string, status?: SettlementStatus): Promise<Settlement[]>;
  findDueSettlements(): Promise<Settlement[]>;
  create(settlement: Settlement): Promise<Settlement>;
  update(settlement: Settlement): Promise<Settlement>;
}

