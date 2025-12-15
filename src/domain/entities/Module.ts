import { randomUUID } from "crypto";

export interface ModuleProps {
  id?: string;
  courseId: string;
  title: string;
  position: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export class Module {
  readonly id: string;
  private props: ModuleProps;

  constructor(props: ModuleProps) {
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
    if (!this.props.courseId || this.props.courseId.trim().length === 0) {
      throw new Error("courseId é obrigatório");
    }
    if (!this.props.title || this.props.title.trim().length === 0) {
      throw new Error("Título é obrigatório");
    }
    if (this.props.position < 0) {
      throw new Error("Posição não pode ser negativa");
    }
  }

  static create(input: { courseId: string; title: string; position: number }): Module {
    return new Module({
      courseId: input.courseId,
      title: input.title,
      position: input.position,
    });
  }

  get courseId(): string {
    return this.props.courseId;
  }

  get title(): string {
    return this.props.title;
  }

  get position(): number {
    return this.props.position;
  }

  get createdAt(): Date {
    return this.props.createdAt!;
  }

  get updatedAt(): Date {
    return this.props.updatedAt!;
  }

  updateTitle(title: string): void {
    if (!title || title.trim().length === 0) {
      throw new Error("Título não pode ser vazio");
    }
    this.props.title = title;
    this.props.updatedAt = new Date();
  }

  updatePosition(position: number): void {
    if (position < 0) {
      throw new Error("Posição não pode ser negativa");
    }
    this.props.position = position;
    this.props.updatedAt = new Date();
  }
}

