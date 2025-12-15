import { Wallet } from "../../domain/entities/Wallet";

export interface WalletRepository {
  findByMerchantId(merchantId: string): Promise<Wallet | null>;
  create(wallet: Wallet): Promise<Wallet>;
  update(wallet: Wallet): Promise<Wallet>;
}

