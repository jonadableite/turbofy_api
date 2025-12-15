import { BankingPort, SettlementRequest, SettlementResponse } from "../../../ports/BankingPort";

export class StubBankingAdapter implements BankingPort {
  async processSettlement(request: SettlementRequest): Promise<SettlementResponse> {
    // Stub implementation for development
    // In production, this would call the actual banking API
    const transactionId = `settlement-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    
    // Simulate async processing
    await new Promise((resolve) => setTimeout(resolve, 100));
    
    return {
      transactionId,
      status: "COMPLETED",
      processedAt: new Date(),
    };
  }

  async getSettlementStatus(transactionId: string): Promise<SettlementResponse> {
    // Stub implementation
    return {
      transactionId,
      status: "COMPLETED",
      processedAt: new Date(),
    };
  }
}

