import { randomUUID } from "crypto";

export enum AffiliationStatus {
  PENDING = "PENDING",
  APPROVED = "APPROVED",
  REJECTED = "REJECTED",
}

export interface AffiliationProps {
  id?: string;
  courseId: string;
  userId: string;
  status?: AffiliationStatus;
  commissionPercent?: number;
  salesCount?: number;
  referralCode?: string;
  autoApproved?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
  approvedAt?: Date;
  rejectedAt?: Date;
}

export class Affiliation {
  readonly id: string;
  private props: AffiliationProps;

  private constructor(props: AffiliationProps) {
    this.id = props.id ?? randomUUID();
    this.props = {
      ...props,
      id: this.id,
      status: props.status ?? AffiliationStatus.PENDING,
      commissionPercent: props.commissionPercent ?? 0,
      salesCount: props.salesCount ?? 0,
      referralCode: props.referralCode ?? randomUUID().replace(/-/g, ""),
      createdAt: props.createdAt ?? new Date(),
      updatedAt: props.updatedAt ?? new Date(),
      autoApproved: props.autoApproved ?? false,
    };
    this.validate();
  }

  static create(input: {
    courseId: string;
    userId: string;
    commissionPercent?: number;
    autoApproved?: boolean;
  }): Affiliation {
    return new Affiliation({
      courseId: input.courseId,
      userId: input.userId,
      status: input.autoApproved ? AffiliationStatus.APPROVED : AffiliationStatus.PENDING,
      commissionPercent: input.commissionPercent ?? 0,
      autoApproved: input.autoApproved ?? false,
      approvedAt: input.autoApproved ? new Date() : undefined,
    });
  }

  static fromPersistence(props: AffiliationProps): Affiliation {
    return new Affiliation(props);
  }

  private validate(): void {
    if (!this.props.courseId) throw new Error("courseId é obrigatório");
    if (!this.props.userId) throw new Error("userId é obrigatório");
    if (this.props.commissionPercent !== undefined) {
      this.ensureCommission(this.props.commissionPercent);
    }
  }

  approve(): void {
    this.props.status = AffiliationStatus.APPROVED;
    this.props.approvedAt = new Date();
    this.props.updatedAt = new Date();
  }

  reject(): void {
    this.props.status = AffiliationStatus.REJECTED;
    this.props.rejectedAt = new Date();
    this.props.updatedAt = new Date();
  }

  incrementSales(): void {
    this.props.salesCount = (this.props.salesCount ?? 0) + 1;
    this.props.updatedAt = new Date();
  }

  setCommission(commissionPercent: number): void {
    this.ensureCommission(commissionPercent);
    this.props.commissionPercent = commissionPercent;
    this.props.updatedAt = new Date();
  }

  private ensureCommission(value: number): void {
    if (value < 0 || value > 100) {
      throw new Error("Comissão deve estar entre 0 e 100%");
    }
  }

  get courseId(): string {
    return this.props.courseId;
  }

  get userId(): string {
    return this.props.userId;
  }

  get status(): AffiliationStatus {
    return this.props.status!;
  }

  get commissionPercent(): number {
    return this.props.commissionPercent ?? 0;
  }

  get salesCount(): number {
    return this.props.salesCount ?? 0;
  }

  get referralCode(): string {
    return this.props.referralCode!;
  }

  get autoApproved(): boolean {
    return this.props.autoApproved ?? false;
  }

  get createdAt(): Date {
    return this.props.createdAt!;
  }

  get updatedAt(): Date {
    return this.props.updatedAt!;
  }
}


