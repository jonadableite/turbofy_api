import { randomUUID } from "crypto";

export enum ChargeStatus {
  PENDING = "PENDING",
  PAID = "PAID",
  EXPIRED = "EXPIRED",
  CANCELED = "CANCELED",
}

export enum ChargeMethod {
  PIX = "PIX",
  BOLETO = "BOLETO",
}

export interface ChargeProps {
  id?: string;
  merchantId: string;
  amountCents: number;
  currency?: string; // default BRL
  description?: string;
  status?: ChargeStatus;
  method?: ChargeMethod;
  expiresAt?: Date;
  idempotencyKey: string;
  externalRef?: string;
  metadata?: Record<string, unknown>;
  pixQrCode?: string;
  pixCopyPaste?: string;
  boletoUrl?: string;
  pixTxid?: string;
  paidAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export class Charge {
  readonly id: string;
  readonly merchantId: string;
  readonly amountCents: number;
  readonly currency: string;
  readonly description?: string;
  private _status: ChargeStatus;
  private _method?: ChargeMethod;
  readonly expiresAt?: Date;
  readonly idempotencyKey: string;
  readonly externalRef?: string;
  readonly metadata?: Record<string, unknown>;
  readonly pixQrCode?: string;
  readonly pixCopyPaste?: string;
  readonly boletoUrl?: string;
  readonly pixTxid?: string;
  paidAt?: Date;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(props: ChargeProps) {
    this.id = props.id || randomUUID();
    this.merchantId = props.merchantId;
    this.amountCents = props.amountCents;
    this.currency = props.currency || "BRL";
    this.description = props.description;
    this._status = props.status || ChargeStatus.PENDING;
    this._method = props.method;
    this.expiresAt = props.expiresAt;
    this.idempotencyKey = props.idempotencyKey;
    this.externalRef = props.externalRef;
    this.metadata = props.metadata;
    this.pixQrCode = props.pixQrCode;
    this.pixCopyPaste = props.pixCopyPaste;
    this.boletoUrl = props.boletoUrl;
    this.pixTxid = props.pixTxid;
    this.paidAt = props.paidAt;
    this.createdAt = props.createdAt || new Date();
    this.updatedAt = props.updatedAt || new Date();
  }

  get status(): ChargeStatus {
    return this._status;
  }

  get method(): ChargeMethod | undefined {
    return this._method;
  }

  setPaymentMethod(method: ChargeMethod) {
    this._method = method;
  }

  markAsPaid(): void {
    this._status = ChargeStatus.PAID;
    this.paidAt = new Date();
  }

  markAsExpired(): void {
    this._status = ChargeStatus.EXPIRED;
  }

  cancel(): void {
    this._status = ChargeStatus.CANCELED;
  }

  // ✨ Immutable helpers to enrich charge with payment data
  withPixData(qrCode: string, copyPaste: string): Charge {
    return new Charge({
      id: this.id,
      merchantId: this.merchantId,
      amountCents: this.amountCents,
      currency: this.currency,
      description: this.description,
      status: this._status,
      method: this._method,
      expiresAt: this.expiresAt,
      idempotencyKey: this.idempotencyKey,
      externalRef: this.externalRef,
      metadata: this.metadata,
      pixQrCode: qrCode,
      pixCopyPaste: copyPaste,
      boletoUrl: this.boletoUrl,
      createdAt: this.createdAt,
      updatedAt: new Date(),
    });
  }

  withBoletoData(boletoUrl: string): Charge {
    return new Charge({
      id: this.id,
      merchantId: this.merchantId,
      amountCents: this.amountCents,
      currency: this.currency,
      description: this.description,
      status: this._status,
      method: this._method,
      expiresAt: this.expiresAt,
      idempotencyKey: this.idempotencyKey,
      externalRef: this.externalRef,
      metadata: this.metadata,
      pixQrCode: this.pixQrCode,
      pixCopyPaste: this.pixCopyPaste,
      boletoUrl,
      createdAt: this.createdAt,
      updatedAt: new Date(),
    });
  }

  withMethod(method: ChargeMethod): Charge {
    return new Charge({
      id: this.id,
      merchantId: this.merchantId,
      amountCents: this.amountCents,
      currency: this.currency,
      description: this.description,
      status: this._status,
      method,
      expiresAt: this.expiresAt,
      idempotencyKey: this.idempotencyKey,
      externalRef: this.externalRef,
      metadata: this.metadata,
      pixQrCode: this.pixQrCode,
      pixCopyPaste: this.pixCopyPaste,
      boletoUrl: this.boletoUrl,
      pixTxid: this.pixTxid,
      createdAt: this.createdAt,
      updatedAt: new Date(),
    });
  }
}
