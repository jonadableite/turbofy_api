import { randomUUID } from "crypto";

export interface FeeProps {
  id?: string;
  chargeId: string;
  type: string; // ex.: PIX_GATEWAY, BOLETO_EMISSION, PLATFORM_FEE
  amountCents: number; // sempre em centavos
  createdAt?: Date;
}

export class Fee {
  readonly id: string;
  readonly chargeId: string;
  readonly type: string;
  readonly amountCents: number;
  readonly createdAt: Date;

  constructor(props: FeeProps) {
    this.id = props.id || randomUUID();
    this.chargeId = props.chargeId;
    this.type = props.type;
    this.createdAt = props.createdAt || new Date();

    if (!props.type || props.type.trim().length === 0) {
      throw new Error("Fee.type é obrigatório");
    }
    if (!Number.isInteger(props.amountCents) || props.amountCents < 0) {
      throw new Error("Fee.amountCents deve ser inteiro e >= 0");
    }
    this.amountCents = props.amountCents;
  }

  // Retorna o total após desconto da taxa
  applyToTotal(totalAmountCents: number): number {
    if (!Number.isInteger(totalAmountCents) || totalAmountCents < 0) {
      throw new Error("Total inválido para aplicação de taxa");
    }
    const result = totalAmountCents - this.amountCents;
    return result < 0 ? 0 : result;
  }
}