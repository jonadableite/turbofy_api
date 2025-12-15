export interface ProviderCredentialsRecord {
  id: string
  merchantId: string
  provider: string
  clientId: string
  clientSecret: string
  accessToken?: string | null
  tokenExpiresAt?: Date | null
}

export interface UpsertProviderCredentialsInput {
  merchantId: string
  provider: string
  clientId: string
  clientSecret: string
}

export interface ProviderCredentialsRepository {
  findByMerchantAndProvider(merchantId: string, provider: string): Promise<ProviderCredentialsRecord | null>
  upsert(input: UpsertProviderCredentialsInput): Promise<ProviderCredentialsRecord>
  updateToken(merchantId: string, provider: string, accessToken: string, tokenExpiresAt: Date): Promise<void>
}
