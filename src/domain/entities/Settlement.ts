import { randomUUID } from "crypto";

export enum SettlementStatus {
  PENDING = "PENDING",
  SCHEDULED = "SCHEDULED",
  PROCESSING = "PROCESSING",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
  CANCELED = "CANCELED",
}

export interface SettlementProps {
  id?: string;
  merchantId: string;
  amountCents: number;
  currency?: string;
  status?: SettlementStatus;
  scheduledFor?: Date;
  processedAt?: Date;
  bankAccountId?: string;
  transactionId?: string;
  failureReason?: string;
  metadata?: Record<string, unknown>;
  createdAt?: Date;
  updatedAt?: Date;
}

export class Settlement {
  readonly id: string;
  readonly merchantId: string;
  readonly amountCents: number;
  readonly currency: string;
  private _status: SettlementStatus;
  private _scheduledFor?: Date;
  private _processedAt?: Date;
  private _bankAccountId?: string;
  private _transactionId?: string;
  private _failureReason?: string;
  readonly metadata?: Record<string, unknown>;
  readonly createdAt: Date;
  private _updatedAt: Date;

  constructor(props: SettlementProps) {
    this.id = props.id || randomUUID();
    this.merchantId = props.merchantId;
    this.amountCents = props.amountCents;
    this.currency = props.currency || "BRL";
    this._status = props.status || SettlementStatus.PENDING;
    this._scheduledFor = props.scheduledFor;
    this._processedAt = props.processedAt;
    this._bankAccountId = props.bankAccountId;
    this._transactionId = props.transactionId;
    this._failureReason = props.failureReason;
    this.metadata = props.metadata;
    this.createdAt = props.createdAt || new Date();
    this._updatedAt = props.updatedAt || new Date();

    // Validações de domínio
    if (this.amountCents <= 0) {
      throw new Error("Settlement amount must be greater than zero");
    }
  }

  get scheduledFor(): Date | undefined {
    return this._scheduledFor;
  }

  get processedAt(): Date | undefined {
    return this._processedAt;
  }

  get bankAccountId(): string | undefined {
    return this._bankAccountId;
  }

  get transactionId(): string | undefined {
    return this._transactionId;
  }

  get failureReason(): string | undefined {
    return this._failureReason;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }

  get status(): SettlementStatus {
    return this._status;
  }

  setTransactionId(transactionId: string): void {
    this._transactionId = transactionId;
    this._updatedAt = new Date();
  }

  schedule(scheduledFor: Date, bankAccountId: string): void {
    if (this._status !== SettlementStatus.PENDING) {
      throw new Error("Only PENDING settlements can be scheduled");
    }
    if (scheduledFor < new Date()) {
      throw new Error("Scheduled date must be in the future");
    }
    this._status = SettlementStatus.SCHEDULED;
    this._scheduledFor = scheduledFor;
    this._bankAccountId = bankAccountId;
    this._updatedAt = new Date();
  }

  startProcessing(): void {
    if (this._status !== SettlementStatus.SCHEDULED && this._status !== SettlementStatus.PENDING) {
      throw new Error("Only SCHEDULED or PENDING settlements can be processed");
    }
    this._status = SettlementStatus.PROCESSING;
    this._updatedAt = new Date();
  }

  complete(transactionId: string): void {
    if (this._status !== SettlementStatus.PROCESSING) {
      throw new Error("Only PROCESSING settlements can be completed");
    }
    this._status = SettlementStatus.COMPLETED;
    this._transactionId = transactionId;
    this._processedAt = new Date();
    this._updatedAt = new Date();
  }

  fail(failureReason: string): void {
    if (this._status !== SettlementStatus.PROCESSING) {
      throw new Error("Only PROCESSING settlements can fail");
    }
    this._status = SettlementStatus.FAILED;
    this._failureReason = failureReason;
    this._updatedAt = new Date();
  }

  cancel(): void {
    if (this._status === SettlementStatus.COMPLETED) {
      throw new Error("Cannot cancel completed settlement");
    }
    this._status = SettlementStatus.CANCELED;
    this._updatedAt = new Date();
  }

  canBeProcessed(): boolean {
    return this._status === SettlementStatus.SCHEDULED || this._status === SettlementStatus.PENDING;
  }

  isDue(): boolean {
    if (!this._scheduledFor) {
      return this._status === SettlementStatus.PENDING;
    }
    return new Date() >= this._scheduledFor && this.canBeProcessed();
  }
}

