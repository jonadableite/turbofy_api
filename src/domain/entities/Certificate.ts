import { randomUUID } from "crypto";
import crypto from "crypto";

export interface CertificateProps {
  id?: string;
  enrollmentId: string;
  verificationQr?: string;
  pdfUrl?: string;
  issuedAt?: Date;
  createdAt?: Date;
}

export class Certificate {
  readonly id: string;
  private props: CertificateProps;

  constructor(props: CertificateProps) {
    this.id = props.id ?? randomUUID();
    this.props = {
      ...props,
      id: this.id,
      issuedAt: props.issuedAt ?? new Date(),
      createdAt: props.createdAt ?? new Date(),
    };

    this.validate();
  }

  private validate(): void {
    if (!this.props.enrollmentId || this.props.enrollmentId.trim().length === 0) {
      throw new Error("enrollmentId é obrigatório");
    }
  }

  static create(input: { enrollmentId: string; pdfUrl?: string }): Certificate {
    const verificationHash = Certificate.generateVerificationHash(input.enrollmentId);

    return new Certificate({
      enrollmentId: input.enrollmentId,
      verificationQr: verificationHash,
      pdfUrl: input.pdfUrl,
    });
  }

  private static generateVerificationHash(enrollmentId: string): string {
    const hash = crypto.createHash("sha256");
    hash.update(`${enrollmentId}-${Date.now()}`);
    return hash.digest("hex").substring(0, 16).toUpperCase();
  }

  get enrollmentId(): string {
    return this.props.enrollmentId;
  }

  get verificationQr(): string | undefined {
    return this.props.verificationQr;
  }

  get pdfUrl(): string | undefined {
    return this.props.pdfUrl;
  }

  get issuedAt(): Date {
    return this.props.issuedAt!;
  }

  get createdAt(): Date {
    return this.props.createdAt!;
  }

  updatePdfUrl(url: string): void {
    if (!url || url.trim().length === 0) {
      throw new Error("URL do PDF não pode ser vazia");
    }
    this.props.pdfUrl = url;
  }
}

