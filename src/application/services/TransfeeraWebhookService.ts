import axios from "axios"
import crypto from "crypto"
import { logger } from "../../infrastructure/logger"
import { env } from "../../config/env"
import { TransfeeraClient } from "../../infrastructure/adapters/payment/TransfeeraClient"
import {
  CreateTransfeeraWebhookConfigInput,
  TransfeeraWebhookConfigRecord,
  TransfeeraWebhookConfigRepository,
  UpdateTransfeeraWebhookConfigInput,
} from "../../ports/repositories/TransfeeraWebhookConfigRepository"

export interface WebhookConfigDTO {
  id: string
  webhookId: string
  accountId: string
  url: string
  objectTypes: string[]
  schemaVersion: string
  active: boolean
  createdAt: Date
  updatedAt: Date
}

export interface WebhookTestResult {
  success: boolean
  statusCode?: number
  durationMs?: number
  error?: string
}

const mapDto = (record: TransfeeraWebhookConfigRecord): WebhookConfigDTO => ({
  id: record.id,
  webhookId: record.webhookId,
  accountId: record.accountId,
  url: record.url,
  objectTypes: record.objectTypes,
  schemaVersion: record.schemaVersion,
  active: record.active,
  createdAt: record.createdAt,
  updatedAt: record.updatedAt,
})

export class TransfeeraWebhookService {
  constructor(
    private readonly repo: TransfeeraWebhookConfigRepository,
    private readonly transfeeraClient: TransfeeraClient,
  ) {}

  async createWebhook(merchantId: string, url: string, objectTypes: string[]): Promise<WebhookConfigDTO> {
    validateWebhookUrl(url)

    const remote = await this.transfeeraClient.createTransfeeraWebhook(url, objectTypes)

    // Garantir que todos os campos obrigatórios estejam presentes
    if (!remote.id) {
      throw new Error("Transfeera não retornou webhookId")
    }
    if (!remote.signature_secret) {
      throw new Error("Transfeera não retornou signatureSecret")
    }

    // Garantir que o url seja sempre definido (usar o original se remote.url não existir)
    const webhookUrl = remote.url || url
    if (!webhookUrl) {
      throw new Error("URL do webhook não está disponível")
    }

    const created = await this.repo.create({
      merchantId,
      webhookId: remote.id,
      accountId: remote.company_id || merchantId,
      url: webhookUrl,
      objectTypes: remote.object_types ?? objectTypes,
      signatureSecret: remote.signature_secret,
      schemaVersion: remote.schema_version ?? "v1",
      active: !remote.deleted_at,
    } as CreateTransfeeraWebhookConfigInput)

    return mapDto(created)
  }

  async listWebhooks(merchantId: string): Promise<WebhookConfigDTO[]> {
    const records = await this.repo.findByMerchant(merchantId)
    return records.map(mapDto)
  }

  async updateWebhook(
    merchantId: string,
    webhookId: string,
    url: string,
    objectTypes: string[],
  ): Promise<WebhookConfigDTO> {
    validateWebhookUrl(url)

    const existing = await this.repo.findByWebhookId(webhookId)
    if (!existing || existing.merchantId !== merchantId) {
      throw new Error("WEBHOOK_NOT_FOUND")
    }

    await this.transfeeraClient.updateTransfeeraWebhook(webhookId, url, objectTypes)

    const updated = await this.repo.update(webhookId, { url, objectTypes } as UpdateTransfeeraWebhookConfigInput)
    return mapDto(updated)
  }

  async deleteWebhook(merchantId: string, webhookId: string): Promise<void> {
    const existing = await this.repo.findByWebhookId(webhookId)
    if (!existing || existing.merchantId !== merchantId) {
      throw new Error("WEBHOOK_NOT_FOUND")
    }

    await this.transfeeraClient.deleteTransfeeraWebhook(webhookId)
    await this.repo.delete(webhookId)
  }

  async testWebhook(merchantId: string, webhookId: string): Promise<WebhookTestResult> {
    const existing = await this.repo.findByWebhookId(webhookId)
    if (!existing || existing.merchantId !== merchantId) {
      throw new Error("WEBHOOK_NOT_FOUND")
    }

    const secret = await this.repo.getSignatureSecret(webhookId)
    if (!secret) {
      throw new Error("WEBHOOK_SECRET_MISSING")
    }

    const payload = {
      id: `test-${Date.now()}`,
      object: "WebhookTest",
      date: new Date().toISOString(),
      data: { message: "Turbofy webhook test" },
    }
    const rawPayload = JSON.stringify(payload)
    const ts = `${Date.now()}`
    const signedPayload = `${ts}.${rawPayload}`
    const signature = crypto.createHmac("sha256", secret).update(signedPayload).digest("hex")

    const started = Date.now()
    try {
      const response = await axios.post(existing.url, payload, {
        headers: {
          "Content-Type": "application/json",
          "Transfeera-Signature": `t=${ts},v1=${signature}`,
          "User-Agent": env.FRONTEND_URL || "Turbofy Webhook Tester",
        },
        timeout: 4000,
        validateStatus: () => true,
      })

      return {
        success: response.status >= 200 && response.status < 300,
        statusCode: response.status,
        durationMs: Date.now() - started,
        error: response.status >= 200 && response.status < 300 ? undefined : response.statusText,
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error"
      logger.error({
        type: "TRANSFEERA_WEBHOOK_TEST_FAILED",
        message: "Failed to test webhook",
        payload: { webhookId },
        error: err,
      })
      return {
        success: false,
        durationMs: Date.now() - started,
        error: msg,
      }
    }
  }
}

const validateWebhookUrl = (url: string): void => {
  const parsed = new URL(url)

  if (env.NODE_ENV === "production" && parsed.protocol !== "https:") {
    throw new Error("WEBHOOK_URL_HTTPS_REQUIRED")
  }

  const hostname = parsed.hostname
  const isPrivate =
    hostname === "localhost" ||
    hostname.startsWith("127.") ||
    hostname.startsWith("10.") ||
    hostname.startsWith("192.168.") ||
    hostname.startsWith("172.16.")

  if (isPrivate && env.NODE_ENV === "production") {
    throw new Error("WEBHOOK_URL_PRIVATE_NOT_ALLOWED")
  }
}

