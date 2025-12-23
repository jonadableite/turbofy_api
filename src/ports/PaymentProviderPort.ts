export interface PixIssueInput {
  amountCents: number;
  merchantId: string;
  description?: string;
  expiresAt?: Date;
}

export interface PixIssueOutput {
  qrCode: string;
  copyPaste: string;
  expiresAt: Date;
  txid?: string; // TXID retornado pelo provedor de pagamento (Transfeera)
}

export interface BoletoIssueInput {
  amountCents: number;
  merchantId: string;
  description?: string;
  expiresAt?: Date;
}

export interface BoletoIssueOutput {
  boletoUrl: string;
  expiresAt: Date;
}

export interface PaymentProviderPort {
  issuePixCharge(input: PixIssueInput): Promise<PixIssueOutput>;
  issueBoletoCharge(input: BoletoIssueInput): Promise<BoletoIssueOutput>;
  
  // Métodos opcionais para funcionalidades adicionais
  getBalance?(): Promise<{ available: number; waiting: number }>;
  getReceivedPix?(params?: {
    startDate?: Date;
    endDate?: Date;
    txid?: string;
  }): Promise<Array<{
    id: string;
    value: number;
    end2endId: string;
    txid?: string;
    pixKey: string;
    payer: {
      name: string;
      document: string;
    };
    createdAt: Date;
  }>>;
}