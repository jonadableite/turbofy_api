import { randomUUID } from "crypto";

export enum WalletTransactionType {
  CREDIT = "CREDIT",
  DEBIT = "DEBIT",
  SETTLEMENT = "SETTLEMENT",
  REFUND = "REFUND",
  FEE = "FEE",
}

export enum WalletTransactionStatus {
  PENDING = "PENDING",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
  CANCELLED = "CANCELLED",
}

export interface WalletTransactionProps {
  id?: string;
  walletId: string;
  type: WalletTransactionType;
  amountCents: number;
  status?: WalletTransactionStatus;
  description?: string;
  referenceId?: string;
  metadata?: Record<string, unknown>;
  processedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export class WalletTransaction {
  readonly id: string;
  readonly walletId: string;
  readonly type: WalletTransactionType;
  readonly amountCents: number;
  private _status: WalletTransactionStatus;
  readonly description?: string;
  readonly referenceId?: string;
  readonly metadata?: Record<string, unknown>;
  private _processedAt?: Date;
  readonly createdAt: Date;
  private _updatedAt: Date;

  constructor(props: WalletTransactionProps) {
    this.id = props.id || randomUUID();
    this.walletId = props.walletId;
    this.type = props.type;
    this.amountCents = props.amountCents;
    this._status = props.status || WalletTransactionStatus.PENDING;
    this.description = props.description;
    this.referenceId = props.referenceId;
    this.metadata = props.metadata;
    this._processedAt = props.processedAt;
    this.createdAt = props.createdAt || new Date();
    this._updatedAt = props.updatedAt || new Date();

    if (this.amountCents <= 0) {
      throw new Error("Transaction amount must be greater than zero");
    }
  }

  get status(): WalletTransactionStatus {
    return this._status;
  }

  get processedAt(): Date | undefined {
    return this._processedAt;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }

  complete(): void {
    if (this._status !== WalletTransactionStatus.PENDING) {
      throw new Error("Only pending transactions can be completed");
    }
    this._status = WalletTransactionStatus.COMPLETED;
    this._processedAt = new Date();
    this._updatedAt = new Date();
  }

  fail(): void {
    if (this._status !== WalletTransactionStatus.PENDING) {
      throw new Error("Only pending transactions can be failed");
    }
    this._status = WalletTransactionStatus.FAILED;
    this._processedAt = new Date();
    this._updatedAt = new Date();
  }

  cancel(): void {
    if (this._status === WalletTransactionStatus.COMPLETED) {
      throw new Error("Completed transactions cannot be cancelled");
    }
    this._status = WalletTransactionStatus.CANCELLED;
    this._updatedAt = new Date();
  }

  toJSON() {
    return {
      id: this.id,
      walletId: this.walletId,
      type: this.type,
      amountCents: this.amountCents,
      status: this._status,
      description: this.description,
      referenceId: this.referenceId,
      metadata: this.metadata,
      processedAt: this._processedAt,
      createdAt: this.createdAt,
      updatedAt: this._updatedAt,
    };
  }
}

