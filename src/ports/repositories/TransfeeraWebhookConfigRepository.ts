export interface TransfeeraWebhookConfigRecord {
  id: string
  merchantId: string
  webhookId: string
  accountId: string
  url: string
  objectTypes: string[]
  schemaVersion: string
  active: boolean
  createdAt: Date
  updatedAt: Date
}

export interface CreateTransfeeraWebhookConfigInput {
  merchantId: string
  webhookId: string
  accountId: string
  url: string
  objectTypes: string[]
  signatureSecret: string
  schemaVersion?: string
  active?: boolean
}

export interface UpdateTransfeeraWebhookConfigInput {
  url?: string
  objectTypes?: string[]
  active?: boolean
}

export interface TransfeeraWebhookConfigRepository {
  create(input: CreateTransfeeraWebhookConfigInput): Promise<TransfeeraWebhookConfigRecord>
  findByMerchant(merchantId: string): Promise<TransfeeraWebhookConfigRecord[]>
  findByWebhookId(webhookId: string): Promise<TransfeeraWebhookConfigRecord | null>
  findByAccountId(accountId: string): Promise<TransfeeraWebhookConfigRecord | null>
  update(webhookId: string, input: UpdateTransfeeraWebhookConfigInput): Promise<TransfeeraWebhookConfigRecord>
  delete(webhookId: string): Promise<void>
  getSignatureSecret(webhookId: string): Promise<string | null>
}

