import { ApiKey } from "../../domain/entities/ApiKey";

export interface ApiKeyRepository {
  save(apiKey: ApiKey): Promise<ApiKey>;
  findById(id: string): Promise<ApiKey | null>;
  findByMerchantId(merchantId: string): Promise<ApiKey[]>;
  findByKeyHash(keyHash: string): Promise<ApiKey | null>;
  findActiveByMerchantId(merchantId: string): Promise<ApiKey[]>;
  update(apiKey: ApiKey): Promise<ApiKey>;
  delete(id: string): Promise<void>;
}

