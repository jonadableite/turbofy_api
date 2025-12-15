import { ApiKeyRepository } from "../../ports/repositories/ApiKeyRepository";

export interface ListApiKeysRequest {
  merchantId: string;
  includeRevoked?: boolean;
}

export interface ApiKeyListItem {
  id: string;
  maskedKey: string;
  name: string | null;
  origin: string;
  permissions: string[];
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  isActive: boolean;
}

export interface ListApiKeysResponse {
  apiKeys: ApiKeyListItem[];
  total: number;
}

export class ListApiKeys {
  constructor(private readonly apiKeyRepository: ApiKeyRepository) {}

  async execute(request: ListApiKeysRequest): Promise<ListApiKeysResponse> {
    const { merchantId, includeRevoked = true } = request;

    const apiKeys = includeRevoked
      ? await this.apiKeyRepository.findByMerchantId(merchantId)
      : await this.apiKeyRepository.findActiveByMerchantId(merchantId);

    const items: ApiKeyListItem[] = apiKeys.map((apiKey) => ({
      id: apiKey.id,
      maskedKey: apiKey.getMaskedKey(),
      name: apiKey.name,
      origin: apiKey.origin,
      permissions: apiKey.permissions,
      lastUsedAt: apiKey.lastUsedAt,
      expiresAt: apiKey.expiresAt,
      revokedAt: apiKey.revokedAt,
      createdAt: apiKey.createdAt,
      isActive: apiKey.isActive(),
    }));

    return {
      apiKeys: items,
      total: items.length,
    };
  }
}

