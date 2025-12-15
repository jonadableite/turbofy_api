
import { MerchantProfile } from '../../domain/entities/MerchantProfile';

export interface MerchantProfileRepository {
  save(profile: MerchantProfile): Promise<void>;
  findByMerchantId(merchantId: string): Promise<MerchantProfile | null>;
}

