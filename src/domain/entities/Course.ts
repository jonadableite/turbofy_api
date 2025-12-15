import { randomUUID } from "crypto";

export enum CourseStatus {
  DRAFT = "DRAFT",
  PUBLISHED = "PUBLISHED",
  ARCHIVED = "ARCHIVED",
}

export enum AccessType {
  LIFETIME = "LIFETIME",
  SUBSCRIPTION = "SUBSCRIPTION",
}

export interface CourseProps {
  id?: string;
  merchantId: string;
  title: string;
  description?: string;
  thumbnailUrl?: string;
  status: CourseStatus;
  accessType: AccessType;
  certificateText?: string;
  marketplaceVisible: boolean;
  affiliateProgramEnabled: boolean;
  affiliateCommissionPercent: number;
  affiliateInviteToken: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export class Course {
  readonly id: string;
  private props: CourseProps;

  constructor(props: CourseProps) {
    this.id = props.id ?? randomUUID();
    this.props = {
      ...props,
      id: this.id,
      affiliateInviteToken: props.affiliateInviteToken ?? randomUUID(),
      affiliateCommissionPercent: props.affiliateCommissionPercent ?? 0,
      affiliateProgramEnabled: props.affiliateProgramEnabled ?? false,
      marketplaceVisible: props.marketplaceVisible ?? false,
      createdAt: props.createdAt ?? new Date(),
      updatedAt: props.updatedAt ?? new Date(),
    };

    this.validate();
  }

  private validate(): void {
    if (!this.props.merchantId || this.props.merchantId.trim().length === 0) {
      throw new Error("merchantId é obrigatório");
    }
    if (!this.props.title || this.props.title.trim().length === 0) {
      throw new Error("Título é obrigatório");
    }
    if (this.props.title.length > 200) {
      throw new Error("Título não pode ter mais de 200 caracteres");
    }
  }

  static create(input: {
    merchantId: string;
    title: string;
    description?: string;
    thumbnailUrl?: string;
    accessType?: AccessType;
    certificateText?: string;
    affiliateProgramEnabled?: boolean;
    affiliateCommissionPercent?: number;
    marketplaceVisible?: boolean;
    affiliateInviteToken?: string;
  }): Course {
    return new Course({
      merchantId: input.merchantId,
      title: input.title,
      description: input.description,
      thumbnailUrl: input.thumbnailUrl,
      status: CourseStatus.DRAFT,
      accessType: input.accessType ?? AccessType.LIFETIME,
      certificateText: input.certificateText,
      affiliateProgramEnabled: input.affiliateProgramEnabled ?? false,
      affiliateCommissionPercent: input.affiliateCommissionPercent ?? 0,
      marketplaceVisible: input.marketplaceVisible ?? false,
      affiliateInviteToken: input.affiliateInviteToken ?? randomUUID(),
    });
  }

  get merchantId(): string {
    return this.props.merchantId;
  }

  get title(): string {
    return this.props.title;
  }

  get description(): string | undefined {
    return this.props.description;
  }

  get thumbnailUrl(): string | undefined {
    return this.props.thumbnailUrl;
  }

  get status(): CourseStatus {
    return this.props.status;
  }

  get accessType(): AccessType {
    return this.props.accessType;
  }

  get certificateText(): string | undefined {
    return this.props.certificateText;
  }

  get marketplaceVisible(): boolean {
    return this.props.marketplaceVisible;
  }

  get affiliateProgramEnabled(): boolean {
    return this.props.affiliateProgramEnabled;
  }

  get affiliateCommissionPercent(): number {
    return this.props.affiliateCommissionPercent;
  }

  get affiliateInviteToken(): string {
    return this.props.affiliateInviteToken;
  }

  get createdAt(): Date {
    return this.props.createdAt!;
  }

  get updatedAt(): Date {
    return this.props.updatedAt!;
  }

  updateDetails(input: {
    title?: string;
    description?: string;
    thumbnailUrl?: string;
    accessType?: AccessType;
    certificateText?: string;
    marketplaceVisible?: boolean;
    affiliateProgramEnabled?: boolean;
    affiliateCommissionPercent?: number;
    affiliateInviteToken?: string;
  }): void {
    if (input.title !== undefined) {
      if (input.title.trim().length === 0) {
        throw new Error("Título não pode ser vazio");
      }
      if (input.title.length > 200) {
        throw new Error("Título não pode ter mais de 200 caracteres");
      }
      this.props.title = input.title;
    }

    if (input.description !== undefined) {
      this.props.description = input.description;
    }

    if (input.thumbnailUrl !== undefined) {
      this.props.thumbnailUrl = input.thumbnailUrl;
    }

    if (input.accessType !== undefined) {
      this.props.accessType = input.accessType;
    }

    if (input.certificateText !== undefined) {
      this.props.certificateText = input.certificateText;
    }

    if (input.marketplaceVisible !== undefined) {
      this.props.marketplaceVisible = input.marketplaceVisible;
    }

    if (input.affiliateProgramEnabled !== undefined) {
      this.props.affiliateProgramEnabled = input.affiliateProgramEnabled;
    }

    if (input.affiliateCommissionPercent !== undefined) {
      this.ensureValidCommission(input.affiliateCommissionPercent);
      this.props.affiliateCommissionPercent = input.affiliateCommissionPercent;
    }

    if (input.affiliateInviteToken !== undefined) {
      this.props.affiliateInviteToken = input.affiliateInviteToken;
    }

    this.props.updatedAt = new Date();
  }

  publish(): void {
    if (this.props.status === CourseStatus.PUBLISHED) {
      throw new Error("Curso já está publicado");
    }
    this.props.status = CourseStatus.PUBLISHED;
    this.props.updatedAt = new Date();
  }

  archive(): void {
    this.props.status = CourseStatus.ARCHIVED;
    this.props.updatedAt = new Date();
  }

  unpublish(): void {
    if (this.props.status !== CourseStatus.PUBLISHED) {
      throw new Error("Curso não está publicado");
    }
    this.props.status = CourseStatus.DRAFT;
    this.props.updatedAt = new Date();
  }

  isPublished(): boolean {
    return this.props.status === CourseStatus.PUBLISHED;
  }

  enableAffiliateProgram(commissionPercent: number): void {
    this.ensureValidCommission(commissionPercent);
    this.props.affiliateProgramEnabled = true;
    this.props.affiliateCommissionPercent = commissionPercent;
    this.props.affiliateInviteToken = randomUUID();
    this.props.updatedAt = new Date();
  }

  disableAffiliateProgram(): void {
    this.props.affiliateProgramEnabled = false;
    this.props.affiliateCommissionPercent = 0;
    this.props.updatedAt = new Date();
  }

  updateMarketplaceVisibility(visible: boolean): void {
    this.props.marketplaceVisible = visible;
    this.props.updatedAt = new Date();
  }

  regenerateInviteToken(): string {
    this.props.affiliateInviteToken = randomUUID();
    this.props.updatedAt = new Date();
    return this.props.affiliateInviteToken;
  }

  private ensureValidCommission(commissionPercent: number): void {
    if (commissionPercent < 0 || commissionPercent > 100) {
      throw new Error("Comissão de afiliado deve estar entre 0 e 100%");
    }
  }
}

