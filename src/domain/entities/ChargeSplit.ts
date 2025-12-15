import { randomUUID } from "crypto";

export interface ChargeSplitProps {
  id?: string;
  chargeId: string;
  merchantId: string;
  amountCents?: number; // valor fixo de split
  percentage?: number; // percentual (0-100)
  createdAt?: Date;
}

export class ChargeSplit {
  readonly id: string;
  readonly chargeId: string;
  readonly merchantId: string;
  private _amountCents?: number;
  private _percentage?: number;
  readonly createdAt: Date;

  constructor(props: ChargeSplitProps) {
    this.id = props.id || randomUUID();
    this.chargeId = props.chargeId;
    this.merchantId = props.merchantId;
    this.createdAt = props.createdAt || new Date();

    if (props.amountCents != null && props.amountCents <= 0) {
      throw new Error("ChargeSplit.amountCents deve ser maior que zero");
    }
    if (props.percentage != null && (props.percentage <= 0 || props.percentage > 100)) {
      throw new Error("ChargeSplit.percentage deve estar entre 0 (exclusivo) e 100 (inclusive)");
    }
    if (props.amountCents == null && props.percentage == null) {
      throw new Error("ChargeSplit requer amountCents ou percentage");
    }
    this._amountCents = props.amountCents;
    this._percentage = props.percentage;
  }

  get amountCents(): number | undefined {
    return this._amountCents;
  }

  get percentage(): number | undefined {
    return this._percentage;
  }

  // Calcula o valor em centavos com base no total da charge
  computeAmountForTotal(totalAmountCents: number): number {
    if (totalAmountCents <= 0) {
      throw new Error("totalAmountCents inválido para cálculo de split");
    }
    if (this._amountCents != null) {
      if (this._amountCents > totalAmountCents) {
        throw new Error("Split não pode exceder o valor total da charge");
      }
      return this._amountCents;
    }
    // percentage guaranteed to be set if amountCents is not
    const calculated = Math.floor((this._percentage as number) * totalAmountCents / 100);
    if (calculated <= 0) {
      throw new Error("Split calculado deve ser maior que zero");
    }
    return calculated;
  }
}