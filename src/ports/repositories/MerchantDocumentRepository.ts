
import { MerchantDocument } from '../../domain/entities/MerchantDocument';

export interface MerchantDocumentRepository {
  save(document: MerchantDocument): Promise<void>;
  findById(id: string): Promise<MerchantDocument | null>;
  findByMerchantId(merchantId: string): Promise<MerchantDocument[]>;
  findByMerchantIdAndType(merchantId: string, type: string): Promise<MerchantDocument | null>;
}

