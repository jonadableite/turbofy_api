import axios from "axios"

export class BspayClient {
  private baseUrl = "https://api.bspay.co"
  async getAccessToken(clientId: string, clientSecret: string): Promise<{ accessToken: string; expiresAt: Date }> {
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64")
    const res = await axios.post(`${this.baseUrl}/v2/oauth/token`, {}, { headers: { Authorization: `Basic ${credentials}` } })
    const token = res.data?.access_token || res.data?.token || res.data?.accessToken
    const ttl = res.data?.expires_in || 3600
    const expiresAt = new Date(Date.now() + ttl * 1000)
    return { accessToken: token, expiresAt }
  }

  async getBalance(accessToken: string): Promise<{ available: number; waiting: number }> {
    const res = await axios.post(`${this.baseUrl}/v2/balance`, {}, { headers: { Authorization: `Bearer ${accessToken}` } })
    const available = Number(res.data?.available ?? res.data?.saldo ?? 0)
    const waiting = Number(res.data?.waiting ?? res.data?.pendente ?? 0)
    return { available, waiting }
  }

  async createPixQrcode(accessToken: string, payload: { amount: number; external_id?: string; payer?: { name?: string; document?: string; email?: string }; postbackUrl?: string }): Promise<{ qrCode: string; copyPaste: string; expiresAt: Date }> {
    const res = await axios.post(`${this.baseUrl}/v2/pix/qrcode`, payload, { headers: { Authorization: `Bearer ${accessToken}` } })
    const qrCode = res.data?.qrcode ?? res.data?.qr_code_base64 ?? res.data?.qrCode
    const copyPaste = res.data?.copyPaste ?? res.data?.payload ?? res.data?.code
    const expires = res.data?.expires_at ?? res.data?.expiresAt
    const expiresAt = expires ? new Date(expires) : new Date(Date.now() + 30 * 60 * 1000)
    return { qrCode, copyPaste, expiresAt }
  }
}
