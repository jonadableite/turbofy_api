import { randomUUID } from "crypto";

export interface CoProducerProps {
  id?: string;
  courseId: string;
  userId: string;
  commissionPercent: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export class CoProducer {
  readonly id: string;
  private props: CoProducerProps;

  constructor(props: CoProducerProps) {
    this.id = props.id ?? randomUUID();
    this.props = {
      ...props,
      id: this.id,
      createdAt: props.createdAt ?? new Date(),
      updatedAt: props.updatedAt ?? new Date(),
    };
    this.validate();
  }

  static create(input: {
    courseId: string;
    userId: string;
    commissionPercent: number;
  }): CoProducer {
    return new CoProducer({
      courseId: input.courseId,
      userId: input.userId,
      commissionPercent: input.commissionPercent,
    });
  }

  private validate(): void {
    if (!this.props.courseId) throw new Error("courseId é obrigatório");
    if (!this.props.userId) throw new Error("userId é obrigatório");
    if (this.props.commissionPercent < 0 || this.props.commissionPercent > 100) {
      throw new Error("commissionPercent deve estar entre 0 e 100");
    }
  }

  setCommissionPercent(value: number): void {
    if (value < 0 || value > 100) {
      throw new Error("commissionPercent deve estar entre 0 e 100");
    }
    this.props.commissionPercent = value;
    this.props.updatedAt = new Date();
  }

  get courseId(): string {
    return this.props.courseId;
  }

  get userId(): string {
    return this.props.userId;
  }

  get commissionPercent(): number {
    return this.props.commissionPercent;
  }

  get createdAt(): Date {
    return this.props.createdAt!;
  }

  get updatedAt(): Date {
    return this.props.updatedAt!;
  }
}


