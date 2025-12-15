import { PixKey } from "../../domain/entities/PixKey";

export interface PixKeyRepository {
  save(pixKey: PixKey): Promise<PixKey>;
  findById(id: string): Promise<PixKey | null>;
  findByMerchantId(merchantId: string): Promise<PixKey[]>;
  findByKey(key: string): Promise<PixKey | null>;
  update(pixKey: PixKey): Promise<PixKey>;
  delete(id: string): Promise<void>;
}
