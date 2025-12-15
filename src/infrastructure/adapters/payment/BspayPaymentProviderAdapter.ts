import { PaymentProviderPort, PixIssueInput, PixIssueOutput, BoletoIssueInput, BoletoIssueOutput } from "../../../ports/PaymentProviderPort"
import { ProviderCredentialsRepository } from "../../../ports/repositories/ProviderCredentialsRepository"
import { BspayClient } from "./BspayClient"

export class BspayPaymentProviderAdapter implements PaymentProviderPort {
  constructor(private readonly repo: ProviderCredentialsRepository, private readonly merchantId: string) {}

  private client = new BspayClient()

  private async ensureToken(): Promise<string> {
    const creds = await this.repo.findByMerchantAndProvider(this.merchantId, "BSPAY")
    if (!creds) throw new Error("BSPAY credentials missing")
    const valid = creds.accessToken && creds.tokenExpiresAt && creds.tokenExpiresAt.getTime() - Date.now() > 60_000
    if (valid) return creds.accessToken as string
    const token = await this.client.getAccessToken(creds.clientId, creds.clientSecret)
    await this.repo.updateToken(this.merchantId, "BSPAY", token.accessToken, token.expiresAt)
    return token.accessToken
  }

  async issuePixCharge(input: PixIssueInput): Promise<PixIssueOutput> {
    const token = await this.ensureToken()
    const payload = { amount: input.amountCents / 100, external_id: input.merchantId, payer: {}, postbackUrl: undefined }
    const res = await this.client.createPixQrcode(token, payload)
    return { qrCode: res.qrCode, copyPaste: res.copyPaste, expiresAt: res.expiresAt }
  }

  async issueBoletoCharge(_input: BoletoIssueInput): Promise<BoletoIssueOutput> {
    throw new Error("Boleto not supported by BSPAY adapter")
  }

  async getBalance(): Promise<{ available: number; waiting: number }> {
    const token = await this.ensureToken()
    return this.client.getBalance(token)
  }
}
