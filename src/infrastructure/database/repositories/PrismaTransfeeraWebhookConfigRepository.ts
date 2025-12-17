import { TransfeeraWebhookConfig } from "@prisma/client"
import { prisma } from "../prismaClient"
import {
  CreateTransfeeraWebhookConfigInput,
  TransfeeraWebhookConfigRecord,
  TransfeeraWebhookConfigRepository,
  UpdateTransfeeraWebhookConfigInput,
} from "../../../ports/repositories/TransfeeraWebhookConfigRepository"
import { decryptSecret, encryptSecret } from "../../security/crypto"

const mapRecord = (row: TransfeeraWebhookConfig): TransfeeraWebhookConfigRecord => ({
  id: row.id,
  merchantId: row.merchantId,
  webhookId: row.webhookId,
  accountId: row.accountId,
  url: row.url,
  objectTypes: row.objectTypes,
  schemaVersion: row.schemaVersion,
  active: row.active,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
})

export class PrismaTransfeeraWebhookConfigRepository
  implements TransfeeraWebhookConfigRepository
{
  async create(input: CreateTransfeeraWebhookConfigInput): Promise<TransfeeraWebhookConfigRecord> {
    const packedSecret = encryptSecret(input.signatureSecret)
    const row = await prisma.transfeeraWebhookConfig.create({
      data: {
        merchantId: input.merchantId,
        webhookId: input.webhookId,
        accountId: input.accountId,
        url: input.url,
        objectTypes: input.objectTypes,
        signatureSecret: packedSecret,
        schemaVersion: input.schemaVersion ?? "v1",
        active: input.active ?? true,
      },
    })
    return mapRecord(row)
  }

  async findByMerchant(merchantId: string): Promise<TransfeeraWebhookConfigRecord[]> {
    const rows = await prisma.transfeeraWebhookConfig.findMany({
      where: { merchantId },
      orderBy: { createdAt: "desc" },
    })
    return rows.map(mapRecord)
  }

  async findByWebhookId(webhookId: string): Promise<TransfeeraWebhookConfigRecord | null> {
    const row = await prisma.transfeeraWebhookConfig.findUnique({
      where: { webhookId },
    })
    return row ? mapRecord(row) : null
  }

  async findByAccountId(accountId: string): Promise<TransfeeraWebhookConfigRecord | null> {
    const row = await prisma.transfeeraWebhookConfig.findFirst({
      where: { accountId },
    })
    return row ? mapRecord(row) : null
  }

  async update(
    webhookId: string,
    input: UpdateTransfeeraWebhookConfigInput,
  ): Promise<TransfeeraWebhookConfigRecord> {
    const row = await prisma.transfeeraWebhookConfig.update({
      where: { webhookId },
      data: {
        url: input.url,
        objectTypes: input.objectTypes,
        active: input.active,
      },
    })
    return mapRecord(row)
  }

  async delete(webhookId: string): Promise<void> {
    await prisma.transfeeraWebhookConfig.delete({
      where: { webhookId },
    })
  }

  async getSignatureSecret(webhookId: string): Promise<string | null> {
    const row = await prisma.transfeeraWebhookConfig.findUnique({
      where: { webhookId },
      select: { signatureSecret: true },
    })
    if (!row) {
      return null
    }
    return decryptSecret(row.signatureSecret)
  }
}

