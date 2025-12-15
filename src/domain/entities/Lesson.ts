import { randomUUID } from "crypto";

export enum VideoProvider {
  PANDA = "PANDA",
  BUNNY = "BUNNY",
  VIMEO = "VIMEO",
  YOUTUBE = "YOUTUBE",
}

export interface DownloadableFile {
  name: string;
  url: string;
  sizeBytes?: number;
}

export interface LessonProps {
  id?: string;
  moduleId: string;
  title: string;
  videoProvider?: VideoProvider;
  videoKey?: string;
  contentHtml?: string;
  downloadableFiles?: DownloadableFile[];
  position: number;
  isPublished: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export class Lesson {
  readonly id: string;
  private props: LessonProps;

  constructor(props: LessonProps) {
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
    if (!this.props.moduleId || this.props.moduleId.trim().length === 0) {
      throw new Error("moduleId é obrigatório");
    }
    if (!this.props.title || this.props.title.trim().length === 0) {
      throw new Error("Título é obrigatório");
    }
    if (this.props.position < 0) {
      throw new Error("Posição não pode ser negativa");
    }
    if (this.props.videoProvider && !this.props.videoKey) {
      throw new Error("videoKey é obrigatório quando videoProvider está definido");
    }
  }

  static create(input: {
    moduleId: string;
    title: string;
    videoProvider?: VideoProvider;
    videoKey?: string;
    contentHtml?: string;
    downloadableFiles?: DownloadableFile[];
    position: number;
  }): Lesson {
    return new Lesson({
      moduleId: input.moduleId,
      title: input.title,
      videoProvider: input.videoProvider,
      videoKey: input.videoKey,
      contentHtml: input.contentHtml,
      downloadableFiles: input.downloadableFiles,
      position: input.position,
      isPublished: false,
    });
  }

  get moduleId(): string {
    return this.props.moduleId;
  }

  get title(): string {
    return this.props.title;
  }

  get videoProvider(): VideoProvider | undefined {
    return this.props.videoProvider;
  }

  get videoKey(): string | undefined {
    return this.props.videoKey;
  }

  get contentHtml(): string | undefined {
    return this.props.contentHtml;
  }

  get downloadableFiles(): DownloadableFile[] | undefined {
    return this.props.downloadableFiles;
  }

  get position(): number {
    return this.props.position;
  }

  get isPublished(): boolean {
    return this.props.isPublished;
  }

  get createdAt(): Date {
    return this.props.createdAt!;
  }

  get updatedAt(): Date {
    return this.props.updatedAt!;
  }

  updateContent(input: {
    title?: string;
    videoProvider?: VideoProvider;
    videoKey?: string;
    contentHtml?: string;
    downloadableFiles?: DownloadableFile[];
  }): void {
    if (input.title !== undefined) {
      if (input.title.trim().length === 0) {
        throw new Error("Título não pode ser vazio");
      }
      this.props.title = input.title;
    }

    if (input.videoProvider !== undefined) {
      this.props.videoProvider = input.videoProvider;
    }

    if (input.videoKey !== undefined) {
      this.props.videoKey = input.videoKey;
    }

    if (input.contentHtml !== undefined) {
      this.props.contentHtml = input.contentHtml;
    }

    if (input.downloadableFiles !== undefined) {
      this.props.downloadableFiles = input.downloadableFiles;
    }

    this.props.updatedAt = new Date();
    this.validate();
  }

  updatePosition(position: number): void {
    if (position < 0) {
      throw new Error("Posição não pode ser negativa");
    }
    this.props.position = position;
    this.props.updatedAt = new Date();
  }

  publish(): void {
    if (this.props.isPublished) {
      throw new Error("Aula já está publicada");
    }
    this.props.isPublished = true;
    this.props.updatedAt = new Date();
  }

  unpublish(): void {
    if (!this.props.isPublished) {
      throw new Error("Aula não está publicada");
    }
    this.props.isPublished = false;
    this.props.updatedAt = new Date();
  }
}

