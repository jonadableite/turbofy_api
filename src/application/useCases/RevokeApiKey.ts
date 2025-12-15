import { ApiKeyRepository } from "../../ports/repositories/ApiKeyRepository";

export interface RevokeApiKeyRequest {
  apiKeyId: string;
  merchantId: string;
  userId: string;
}

export interface RevokeApiKeyResponse {
  id: string;
  revokedAt: Date;
  success: boolean;
}

export class ApiKeyNotFoundError extends Error {
  constructor(apiKeyId: string) {
    super(`API Key não encontrada: ${apiKeyId}`);
    this.name = "ApiKeyNotFoundError";
  }
}

export class ApiKeyUnauthorizedError extends Error {
  constructor(apiKeyId: string, merchantId: string) {
    super(`API Key ${apiKeyId} não pertence ao merchant ${merchantId}`);
    this.name = "ApiKeyUnauthorizedError";
  }
}

export class ApiKeyAlreadyRevokedError extends Error {
  constructor(apiKeyId: string) {
    super(`API Key já foi revogada: ${apiKeyId}`);
    this.name = "ApiKeyAlreadyRevokedError";
  }
}

export class RevokeApiKey {
  constructor(private readonly apiKeyRepository: ApiKeyRepository) {}

  async execute(request: RevokeApiKeyRequest): Promise<RevokeApiKeyResponse> {
    const { apiKeyId, merchantId, userId } = request;

    const apiKey = await this.apiKeyRepository.findById(apiKeyId);

    if (!apiKey) {
      throw new ApiKeyNotFoundError(apiKeyId);
    }

    if (apiKey.merchantId !== merchantId) {
      throw new ApiKeyUnauthorizedError(apiKeyId, merchantId);
    }

    if (apiKey.isRevoked()) {
      throw new ApiKeyAlreadyRevokedError(apiKeyId);
    }

    const revokedApiKey = apiKey.revoke(userId);
    await this.apiKeyRepository.update(revokedApiKey);

    return {
      id: revokedApiKey.id,
      revokedAt: revokedApiKey.revokedAt!,
      success: true,
    };
  }
}

