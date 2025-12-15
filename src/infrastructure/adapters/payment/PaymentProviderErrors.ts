export class PaymentProviderError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(params: { statusCode: number; code: string; message: string }) {
    super(params.message);
    this.name = "PaymentProviderError";
    this.statusCode = params.statusCode;
    this.code = params.code;
  }
}

