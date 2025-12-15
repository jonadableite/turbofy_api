import { randomUUID } from "crypto";

export enum PaymentStatus {
  PENDING = "PENDING",
  PROCESSING = "PROCESSING",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
  REFUNDED = "REFUNDED",
}

export enum PaymentMethod {
  PIX = "PIX",
  BOLETO = "BOLETO",
  CREDIT_CARD = "CREDIT_CARD",
}

export interface PaymentProps {
  id?: string;
  amount: number;
  description: string;
  merchantId: string;
  status?: PaymentStatus;
  method: PaymentMethod;
  customerEmail: string;
  customerName: string;
  customerDocument?: string;
  createdAt?: Date;
  updatedAt?: Date;
  expiresAt?: Date;
  metadata?: Record<string, unknown>;
}

export class Payment {
  readonly id: string;
  readonly amount: number;
  readonly description: string;
  readonly merchantId: string;
  readonly customerEmail: string;
  readonly customerName: string;
  readonly customerDocument?: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly expiresAt?: Date;
  readonly metadata?: Record<string, unknown>;

  private _status: PaymentStatus;
  private _method: PaymentMethod;

  constructor(props: PaymentProps) {
    this.id = props.id || randomUUID();
    this.amount = props.amount;
    this.description = props.description;
    this.merchantId = props.merchantId;
    this._status = props.status || PaymentStatus.PENDING;
    this._method = props.method;
    this.customerEmail = props.customerEmail;
    this.customerName = props.customerName;
    this.customerDocument = props.customerDocument;
    this.createdAt = props.createdAt || new Date();
    this.updatedAt = props.updatedAt || new Date();
    this.expiresAt = props.expiresAt;
    this.metadata = props.metadata;
  }

  get status(): PaymentStatus {
    return this._status;
  }

  get method(): PaymentMethod {
    return this._method;
  }

  complete(): void {
    this._status = PaymentStatus.COMPLETED;
  }

  fail(): void {
    this._status = PaymentStatus.FAILED;
  }

  process(): void {
    this._status = PaymentStatus.PROCESSING;
  }

  refund(): void {
    this._status = PaymentStatus.REFUNDED;
  }

  isExpired(): boolean {
    if (!this.expiresAt) return false;
    return new Date() > this.expiresAt;
  }
}
