import { randomUUID } from "crypto";

export enum EnrollmentStatus {
  ACTIVE = "ACTIVE",
  REFUNDED = "REFUNDED",
  REVOKED = "REVOKED",
}

export interface EnrollmentProps {
  id?: string;
  courseId: string;
  userId: string;
  chargeId: string;
  status: EnrollmentStatus;
  accessDate?: Date;
  revokedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export class Enrollment {
  readonly id: string;
  private props: EnrollmentProps;

  constructor(props: EnrollmentProps) {
    this.id = props.id ?? randomUUID();
    this.props = {
      ...props,
      id: this.id,
      accessDate: props.accessDate ?? new Date(),
      createdAt: props.createdAt ?? new Date(),
      updatedAt: props.updatedAt ?? new Date(),
    };

    this.validate();
  }

  private validate(): void {
    if (!this.props.courseId || this.props.courseId.trim().length === 0) {
      throw new Error("courseId é obrigatório");
    }
    if (!this.props.userId || this.props.userId.trim().length === 0) {
      throw new Error("userId é obrigatório");
    }
    if (!this.props.chargeId || this.props.chargeId.trim().length === 0) {
      throw new Error("chargeId é obrigatório");
    }
  }

  static create(input: { courseId: string; userId: string; chargeId: string }): Enrollment {
    return new Enrollment({
      courseId: input.courseId,
      userId: input.userId,
      chargeId: input.chargeId,
      status: EnrollmentStatus.ACTIVE,
    });
  }

  get courseId(): string {
    return this.props.courseId;
  }

  get userId(): string {
    return this.props.userId;
  }

  get chargeId(): string {
    return this.props.chargeId;
  }

  get status(): EnrollmentStatus {
    return this.props.status;
  }

  get accessDate(): Date {
    return this.props.accessDate!;
  }

  get revokedAt(): Date | undefined {
    return this.props.revokedAt;
  }

  get createdAt(): Date {
    return this.props.createdAt!;
  }

  get updatedAt(): Date {
    return this.props.updatedAt!;
  }

  isActive(): boolean {
    return this.props.status === EnrollmentStatus.ACTIVE;
  }

  revoke(): void {
    if (this.props.status !== EnrollmentStatus.ACTIVE) {
      throw new Error("Apenas matrículas ativas podem ser revogadas");
    }
    this.props.status = EnrollmentStatus.REVOKED;
    this.props.revokedAt = new Date();
    this.props.updatedAt = new Date();
  }

  markAsRefunded(): void {
    if (this.props.status !== EnrollmentStatus.ACTIVE) {
      throw new Error("Apenas matrículas ativas podem ser reembolsadas");
    }
    this.props.status = EnrollmentStatus.REFUNDED;
    this.props.revokedAt = new Date();
    this.props.updatedAt = new Date();
  }
}

