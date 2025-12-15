import { Charge } from "../domain/entities/Charge";
import { ChargeSplit } from "../domain/entities/ChargeSplit";
import { Fee } from "../domain/entities/Fee";

export interface ChargeRepository {
  findById(id: string): Promise<Charge | null>;
  findByIdempotencyKey(idempotencyKey: string): Promise<Charge | null>;
  findByExternalRef(externalRef: string): Promise<Charge | null>;
  findByTxid(txid: string): Promise<Charge | null>;
  create(charge: Charge): Promise<Charge>;
  update(charge: Charge): Promise<Charge>;
  addSplit(chargeId: string, split: ChargeSplit): Promise<ChargeSplit>;
  addFee(chargeId: string, fee: Fee): Promise<Fee>;
}
