import { ApiKey, CreateApiKeyInput, CreateApiKeyResult } from "../../domain/entities/ApiKey";
import { ApiKeyRepository } from "../../ports/repositories/ApiKeyRepository";

export interface CreateApiKeyRequest {
  merchantId: string;
  name?: string;
  origin?: "DASHBOARD" | "CLI" | "API";
  permissions?: string[];
  expiresAt?: Date;
}

export interface CreateApiKeyResponse {
  id: string;
  merchantId: string;
  rawKey: string; // Mostrada apenas uma vez
  maskedKey: string;
  name: string | null;
  origin: string;
  permissions: string[];
  expiresAt: Date | null;
  createdAt: Date;
}

export class CreateApiKey {
  constructor(private readonly apiKeyRepository: ApiKeyRepository) {}

  async execute(request: CreateApiKeyRequest): Promise<CreateApiKeyResponse> {
    const input: CreateApiKeyInput = {
      merchantId: request.merchantId,
      name: request.name,
      origin: request.origin,
      permissions: request.permissions,
      expiresAt: request.expiresAt,
    };

    const { apiKey, rawKey }: CreateApiKeyResult = ApiKey.create(input);

    await this.apiKeyRepository.save(apiKey);

    return {
      id: apiKey.id,
      merchantId: apiKey.merchantId,
      rawKey,
      maskedKey: apiKey.getMaskedKey(),
      name: apiKey.name,
      origin: apiKey.origin,
      permissions: apiKey.permissions,
      expiresAt: apiKey.expiresAt,
      createdAt: apiKey.createdAt,
    };
  }
}

