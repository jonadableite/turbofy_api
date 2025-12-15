import { randomUUID } from "crypto";
import { ChargeMethod } from "./Charge";

export enum PaymentInteractionType {
  CHARGE_CREATED = "CHARGE_CREATED",
  PIX_ISSUED = "PIX_ISSUED",
  BOLETO_ISSUED = "BOLETO_ISSUED",
  CHARGE_PAID = "CHARGE_PAID",
  CHARGE_EXPIRED = "CHARGE_EXPIRED",
  CHECKOUT_SESSION_CREATED = "CHECKOUT_SESSION_CREATED",
  ENROLLMENT_CREATED = "ENROLLMENT_CREATED",
}

export interface PaymentInteractionProps {
  id?: string;
  merchantId: string;
  userId?: string;
  chargeId?: string;
  sessionId?: string;
  type: PaymentInteractionType;
  method?: ChargeMethod;
  provider?: string;
  amountCents?: number;
  metadata?: Record<string, unknown>;
  createdAt?: Date;
}

export class PaymentInteraction {
  readonly id: string;
  readonly merchantId: string;
  readonly userId?: string;
  readonly chargeId?: string;
  readonly sessionId?: string;
  readonly type: PaymentInteractionType;
  readonly method?: ChargeMethod;
  readonly provider?: string;
  readonly amountCents?: number;
  readonly metadata?: Record<string, unknown>;
  readonly createdAt: Date;

  constructor(props: PaymentInteractionProps) {
    this.id = props.id ?? randomUUID();
    this.merchantId = props.merchantId;
    this.userId = props.userId;
    this.chargeId = props.chargeId;
    this.sessionId = props.sessionId;
    this.type = props.type;
    this.method = props.method;
    this.provider = props.provider;
    this.amountCents = props.amountCents;
    this.metadata = props.metadata;
    this.createdAt = props.createdAt ?? new Date();
  }

  static create(props: PaymentInteractionProps): PaymentInteraction {
    return new PaymentInteraction(props);
  }
}

