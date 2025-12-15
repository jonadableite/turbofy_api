import { PaymentInteraction } from "../../domain/entities/PaymentInteraction";

export interface PaymentInteractionRepository {
  create(interaction: PaymentInteraction): Promise<PaymentInteraction>;

  listRecentByMerchant(params: {
    merchantId: string;
    limit: number;
  }): Promise<PaymentInteraction[]>;
}

