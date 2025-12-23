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

    // Verificar se já existe webhook na Transfeera com os mesmos objectTypes
    // A Transfeera só permite 1 webhook por conjunto de objectTypes
    let remote: { id: string; company_id?: string; url: string; object_types: string[]; schema_version?: string; signature_secret: string; deleted_at?: string | null }
    
    try {
      // Tentar criar novo webhook
      remote = await this.transfeeraClient.createTransfeeraWebhook(url, objectTypes)
    } catch (error) {
      // Se erro 400 com mensagem sobre limite de webhooks, tentar atualizar existente
      if (
        error instanceof Error &&
        error.message.includes("You can only have 1 webhook URL per object types")
      ) {
        logger.info(
          {
            merchantId,
            url,
            objectTypes,
            tip: "Webhook já existe na Transfeera para estes objectTypes. Buscando existente para atualizar.",
          },
          "Webhook already exists, attempting to update"
        )

        // Listar webhooks existentes na Transfeera
        const existingWebhooks = await this.transfeeraClient.listTransfeeraWebhooks()
        
        // Encontrar webhook que corresponde aos objectTypes solicitados
        // A Transfeera pode ter webhooks com objectTypes diferentes, precisamos encontrar o que corresponde
        const matchingWebhook = existingWebhooks.find((wh) => {
          // Verificar se os objectTypes são os mesmos (ordem não importa)
          const whTypes = (wh.object_types || []).sort()
          const requestedTypes = objectTypes.sort()
          return (
            whTypes.length === requestedTypes.length &&
            whTypes.every((type, idx) => type === requestedTypes[idx])
          )
        })

        if (matchingWebhook) {
          // Atualizar webhook existente
          logger.info(
            {
              webhookId: matchingWebhook.id,
              oldUrl: matchingWebhook.url,
              newUrl: url,
              objectTypes,
            },
            "Updating existing Transfeera webhook"
          )

          await this.transfeeraClient.updateTransfeeraWebhook(
            matchingWebhook.id,
            url,
            objectTypes
          )

          // Buscar webhook atualizado (a Transfeera pode retornar dados atualizados)
          const updatedWebhooks = await this.transfeeraClient.listTransfeeraWebhooks()
          const updated = updatedWebhooks.find((wh) => wh.id === matchingWebhook.id)

          if (!updated) {
            throw new Error("Failed to retrieve updated webhook from Transfeera")
          }

          remote = updated
        } else {
          // Não encontrou webhook correspondente, mas Transfeera disse que já existe
          // Pode ser que os objectTypes sejam diferentes mas conflitantes
          throw new Error(
            `Webhook já existe na Transfeera para estes objectTypes, mas não foi possível encontrá-lo para atualizar. ` +
            `Por favor, delete o webhook existente manualmente na Transfeera ou use objectTypes diferentes.`
          )
        }
      } else {
        // Outro tipo de erro, propagar
        throw error
      }
    }

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

    // Verificar se já existe no nosso banco
    const existingInDb = await this.repo.findByWebhookId(remote.id)
    
    if (existingInDb) {
      // Atualizar registro existente
      if (existingInDb.merchantId !== merchantId) {
        throw new Error("Webhook pertence a outro merchant")
      }

      const updated = await this.repo.update(remote.id, {
        url: webhookUrl,
        objectTypes: remote.object_types ?? objectTypes,
        active: !remote.deleted_at,
      } as UpdateTransfeeraWebhookConfigInput)

      logger.info(
        {
          webhookId: remote.id,
          merchantId,
        },
        "Webhook updated in database"
      )

      return mapDto(updated)
    } else {
      // Criar novo registro
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

      logger.info(
        {
          webhookId: remote.id,
          merchantId,
        },
        "Webhook created in database"
      )

      return mapDto(created)
    }
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

