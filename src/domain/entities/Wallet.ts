import { randomUUID } from "crypto";

export interface WalletProps {
  id?: string;
  merchantId: string;
  availableBalanceCents: number;
  pendingBalanceCents: number;
  totalEarnedCents: number;
  currency?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export class Wallet {
  readonly id: string;
  readonly merchantId: string;
  private _availableBalanceCents: number;
  private _pendingBalanceCents: number;
  private _totalEarnedCents: number;
  readonly currency: string;
  readonly createdAt: Date;
  private _updatedAt: Date;

  constructor(props: WalletProps) {
    this.id = props.id || randomUUID();
    this.merchantId = props.merchantId;
    this._availableBalanceCents = props.availableBalanceCents;
    this._pendingBalanceCents = props.pendingBalanceCents;
    this._totalEarnedCents = props.totalEarnedCents;
    this.currency = props.currency || "BRL";
    this.createdAt = props.createdAt || new Date();
    this._updatedAt = props.updatedAt || new Date();
  }

  get availableBalanceCents(): number {
    return this._availableBalanceCents;
  }

  get pendingBalanceCents(): number {
    return this._pendingBalanceCents;
  }

  get totalEarnedCents(): number {
    return this._totalEarnedCents;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }

  credit(amountCents: number): void {
    if (amountCents <= 0) {
      throw new Error("Credit amount must be greater than zero");
    }
    this._availableBalanceCents += amountCents;
    this._totalEarnedCents += amountCents;
    this._updatedAt = new Date();
  }

  debit(amountCents: number): void {
    if (amountCents <= 0) {
      throw new Error("Debit amount must be greater than zero");
    }
    if (this._availableBalanceCents < amountCents) {
      throw new Error("Insufficient available balance");
    }
    this._availableBalanceCents -= amountCents;
    this._updatedAt = new Date();
  }

  moveToPending(amountCents: number): void {
    if (amountCents <= 0) {
      throw new Error("Amount must be greater than zero");
    }
    if (this._availableBalanceCents < amountCents) {
      throw new Error("Insufficient available balance");
    }
    this._availableBalanceCents -= amountCents;
    this._pendingBalanceCents += amountCents;
    this._updatedAt = new Date();
  }

  releasePending(amountCents: number): void {
    if (amountCents <= 0) {
      throw new Error("Amount must be greater than zero");
    }
    if (this._pendingBalanceCents < amountCents) {
      throw new Error("Insufficient pending balance");
    }
    this._pendingBalanceCents -= amountCents;
    this._availableBalanceCents += amountCents;
    this._updatedAt = new Date();
  }

  toJSON() {
    return {
      id: this.id,
      merchantId: this.merchantId,
      availableBalanceCents: this._availableBalanceCents,
      pendingBalanceCents: this._pendingBalanceCents,
      totalEarnedCents: this._totalEarnedCents,
      currency: this.currency,
      createdAt: this.createdAt,
      updatedAt: this._updatedAt,
    };
  }
}

