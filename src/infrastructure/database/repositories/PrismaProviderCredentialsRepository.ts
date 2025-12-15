import { prisma } from "../prismaClient"
import { ProviderCredentialsRecord, ProviderCredentialsRepository, UpsertProviderCredentialsInput } from "../../../ports/repositories/ProviderCredentialsRepository"
import { encryptSecret, decryptSecret } from "../../security/crypto"

export class PrismaProviderCredentialsRepository implements ProviderCredentialsRepository {
  async findByMerchantAndProvider(merchantId: string, provider: string): Promise<ProviderCredentialsRecord | null> {
    const rec = await prisma.providerCredentials.findUnique({ where: { merchantId_provider: { merchantId, provider } } })
    if (!rec) return null
    return {
      id: rec.id,
      merchantId: rec.merchantId,
      provider: rec.provider,
      clientId: rec.clientId,
      clientSecret: decryptSafe(rec.clientSecret),
      accessToken: rec.accessToken ? decryptSafe(rec.accessToken) : null,
      tokenExpiresAt: rec.tokenExpiresAt ?? null,
    }
  }

  async upsert(input: UpsertProviderCredentialsInput): Promise<ProviderCredentialsRecord> {
    const saved = await prisma.providerCredentials.upsert({
      where: { merchantId_provider: { merchantId: input.merchantId, provider: input.provider } },
      update: { clientId: input.clientId, clientSecret: encryptSecret(input.clientSecret) },
      create: {
        merchantId: input.merchantId,
        provider: input.provider,
        clientId: input.clientId,
        clientSecret: encryptSecret(input.clientSecret),
      },
    })
    return {
      id: saved.id,
      merchantId: saved.merchantId,
      provider: saved.provider,
      clientId: saved.clientId,
      clientSecret: decryptSafe(saved.clientSecret),
      accessToken: saved.accessToken ? decryptSafe(saved.accessToken) : null,
      tokenExpiresAt: saved.tokenExpiresAt ?? null,
    }
  }

  async updateToken(merchantId: string, provider: string, accessToken: string, tokenExpiresAt: Date): Promise<void> {
    await prisma.providerCredentials.update({
      where: { merchantId_provider: { merchantId, provider } },
      data: { accessToken: encryptSecret(accessToken), tokenExpiresAt },
    })
  }
}

function decryptSafe(value: string): string {
  try { return decryptSecret(value) } catch { return value }
}
