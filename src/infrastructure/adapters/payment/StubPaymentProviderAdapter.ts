import { PaymentProviderPort, PixIssueInput, PixIssueOutput, BoletoIssueInput, BoletoIssueOutput } from "../../../ports/PaymentProviderPort";

export class StubPaymentProviderAdapter implements PaymentProviderPort {
  async issuePixCharge(input: PixIssueInput): Promise<PixIssueOutput> {
    const expires = input.expiresAt ?? new Date(Date.now() + 1000 * 60 * 15);
    const qrCode = Buffer.from(`PIX:${input.merchantId}:${input.amountCents}:${expires.toISOString()}`).toString("base64");
    const copyPaste = `00020126580014BR.GOV.BCB.PIX0136${input.merchantId}5204000053039865802BR5910TURBOFY6009SaoPaulo6212id:${Date.now()}6304ABCD`;
    // Gerar txid mockado para testes
    const txid = `STUB${Date.now()}${Math.random().toString(36).substring(2, 15).toUpperCase()}`.substring(0, 35);
    return { qrCode, copyPaste, expiresAt: expires, txid };
  }

  async issueBoletoCharge(input: BoletoIssueInput): Promise<BoletoIssueOutput> {
    const expires = input.expiresAt ?? new Date(Date.now() + 1000 * 60 * 60 * 24 * 3);
    const boletoUrl = `https://boleto.turbofy/pay/${input.merchantId}/${Date.now()}`;
    return { boletoUrl, expiresAt: expires };
  }
}