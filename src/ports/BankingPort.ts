export interface SettlementRequest {
  merchantId: string;
  amountCents: number;
  bankAccountId: string;
  description?: string;
  settlementId?: string;
}

export interface SettlementResponse {
  transactionId: string;
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
  processedAt?: Date;
  failureReason?: string;
}

export interface BankingPort {
  processSettlement(request: SettlementRequest): Promise<SettlementResponse>;
  getSettlementStatus(transactionId: string): Promise<SettlementResponse>;
}

