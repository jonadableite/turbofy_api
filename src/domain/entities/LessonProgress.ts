import { randomUUID } from "crypto";

export interface LessonProgressProps {
  id?: string;
  enrollmentId: string;
  lessonId: string;
  progressPercent: number;
  completedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export class LessonProgress {
  readonly id: string;
  private props: LessonProgressProps;

  constructor(props: LessonProgressProps) {
    this.id = props.id ?? randomUUID();
    this.props = {
      ...props,
      id: this.id,
      createdAt: props.createdAt ?? new Date(),
      updatedAt: props.updatedAt ?? new Date(),
    };

    this.validate();
  }

  private validate(): void {
    if (!this.props.enrollmentId || this.props.enrollmentId.trim().length === 0) {
      throw new Error("enrollmentId é obrigatório");
    }
    if (!this.props.lessonId || this.props.lessonId.trim().length === 0) {
      throw new Error("lessonId é obrigatório");
    }
    if (this.props.progressPercent < 0 || this.props.progressPercent > 100) {
      throw new Error("progressPercent deve estar entre 0 e 100");
    }
  }

  static create(input: { enrollmentId: string; lessonId: string; progressPercent?: number }): LessonProgress {
    return new LessonProgress({
      enrollmentId: input.enrollmentId,
      lessonId: input.lessonId,
      progressPercent: input.progressPercent ?? 0,
    });
  }

  get enrollmentId(): string {
    return this.props.enrollmentId;
  }

  get lessonId(): string {
    return this.props.lessonId;
  }

  get progressPercent(): number {
    return this.props.progressPercent;
  }

  get completedAt(): Date | undefined {
    return this.props.completedAt;
  }

  get createdAt(): Date {
    return this.props.createdAt!;
  }

  get updatedAt(): Date {
    return this.props.updatedAt!;
  }

  isCompleted(): boolean {
    return this.props.progressPercent === 100 && this.props.completedAt !== undefined;
  }

  updateProgress(percent: number): void {
    if (percent < 0 || percent > 100) {
      throw new Error("progressPercent deve estar entre 0 e 100");
    }

    // Progresso só pode aumentar, nunca diminuir
    if (percent < this.props.progressPercent) {
      return;
    }

    this.props.progressPercent = percent;
    this.props.updatedAt = new Date();

    // Marcar como concluído quando atingir 100%
    if (percent === 100 && !this.props.completedAt) {
      this.props.completedAt = new Date();
    }
  }

  markAsCompleted(): void {
    this.props.progressPercent = 100;
    this.props.completedAt = new Date();
    this.props.updatedAt = new Date();
  }
}

