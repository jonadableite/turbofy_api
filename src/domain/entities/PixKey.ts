import { randomUUID } from "crypto";

export enum PixKeyType {
  CPF = "CPF",
  CNPJ = "CNPJ",
  EMAIL = "EMAIL",
  PHONE = "PHONE",
  RANDOM = "RANDOM",
}

export interface PixKeyProps {
  id?: string;
  merchantId: string;
  type: PixKeyType;
  key: string;
  description?: string;
  createdAt?: Date;
  updatedAt?: Date;
  isActive?: boolean;
}

export class PixKey {
  readonly id: string;
  readonly merchantId: string;
  readonly type: PixKeyType;
  readonly key: string;
  readonly description?: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  private _isActive: boolean;

  constructor(props: PixKeyProps) {
    this.id = props.id || randomUUID();
    this.merchantId = props.merchantId;
    this.type = props.type;
    this.key = props.key;
    this.description = props.description;
    this.createdAt = props.createdAt || new Date();
    this.updatedAt = props.updatedAt || new Date();
    this._isActive = props.isActive ?? true;
  }

  get isActive(): boolean {
    return this._isActive;
  }

  activate(): void {
    this._isActive = true;
  }

  deactivate(): void {
    this._isActive = false;
  }
}
