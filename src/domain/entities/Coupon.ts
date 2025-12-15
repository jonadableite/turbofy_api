import { randomUUID } from "crypto";

/**
 * @security Validates coupon data to prevent invalid discounts
 * @performance Lightweight entity with minimal dependencies
 * @maintainability Clear separation of domain logic
 * @testability Pure functions and constructor validation
 */

export enum DiscountType {
  PERCENTAGE = "PERCENTAGE",
  FIXED = "FIXED",
}

export interface CouponProps {
  id?: string;
  merchantId: string;
  courseId?: string;
  code: string;
  description?: string;
  discountType: DiscountType;
  percentage?: number;
  amountCents?: number;
  maxRedemptions?: number;
  redemptions?: number;
  expiresAt?: Date;
  active?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export class CouponValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CouponValidationError";
  }
}

export class Coupon {
  readonly id: string;
  private props: CouponProps;

  constructor(props: CouponProps) {
    this.id = props.id ?? randomUUID();
    this.props = {
      ...props,
      id: this.id,
      redemptions: props.redemptions ?? 0,
      active: props.active ?? true,
      createdAt: props.createdAt ?? new Date(),
      updatedAt: props.updatedAt ?? new Date(),
    };

    this.validate();
  }

  private validate(): void {
    if (!this.props.merchantId || this.props.merchantId.trim().length === 0) {
      throw new CouponValidationError("merchantId é obrigatório");
    }

    if (!this.props.code || this.props.code.trim().length === 0) {
      throw new CouponValidationError("Código do cupom é obrigatório");
    }

    if (this.props.code.length > 50) {
      throw new CouponValidationError("Código do cupom não pode ter mais de 50 caracteres");
    }

    // Validate code format (alphanumeric, uppercase)
    const codeRegex = /^[A-Z0-9_-]+$/;
    if (!codeRegex.test(this.props.code.toUpperCase())) {
      throw new CouponValidationError("Código do cupom deve conter apenas letras, números, hífen e underscore");
    }

    if (this.props.discountType === DiscountType.PERCENTAGE) {
      if (this.props.percentage === undefined || this.props.percentage === null) {
        throw new CouponValidationError("Percentual de desconto é obrigatório para cupons de porcentagem");
      }
      if (this.props.percentage < 1 || this.props.percentage > 100) {
        throw new CouponValidationError("Percentual de desconto deve estar entre 1 e 100");
      }
    }

    if (this.props.discountType === DiscountType.FIXED) {
      if (this.props.amountCents === undefined || this.props.amountCents === null) {
        throw new CouponValidationError("Valor do desconto é obrigatório para cupons de valor fixo");
      }
      if (this.props.amountCents < 1) {
        throw new CouponValidationError("Valor do desconto deve ser maior que zero");
      }
    }

    if (this.props.maxRedemptions !== undefined && this.props.maxRedemptions < 0) {
      throw new CouponValidationError("Quantidade máxima de resgates não pode ser negativa");
    }
  }

  static create(input: {
    merchantId: string;
    courseId?: string;
    code: string;
    description?: string;
    discountType: DiscountType;
    percentage?: number;
    amountCents?: number;
    maxRedemptions?: number;
    expiresAt?: Date;
  }): Coupon {
    return new Coupon({
      merchantId: input.merchantId,
      courseId: input.courseId,
      code: input.code.toUpperCase().trim(),
      description: input.description,
      discountType: input.discountType,
      percentage: input.percentage,
      amountCents: input.amountCents,
      maxRedemptions: input.maxRedemptions,
      expiresAt: input.expiresAt,
    });
  }

  // Getters
  get merchantId(): string {
    return this.props.merchantId;
  }

  get courseId(): string | undefined {
    return this.props.courseId;
  }

  get code(): string {
    return this.props.code;
  }

  get description(): string | undefined {
    return this.props.description;
  }

  get discountType(): DiscountType {
    return this.props.discountType;
  }

  get percentage(): number | undefined {
    return this.props.percentage;
  }

  get amountCents(): number | undefined {
    return this.props.amountCents;
  }

  get maxRedemptions(): number | undefined {
    return this.props.maxRedemptions;
  }

  get redemptions(): number {
    return this.props.redemptions ?? 0;
  }

  get expiresAt(): Date | undefined {
    return this.props.expiresAt;
  }

  get active(): boolean {
    return this.props.active ?? true;
  }

  get createdAt(): Date {
    return this.props.createdAt!;
  }

  get updatedAt(): Date {
    return this.props.updatedAt!;
  }

  // Business logic methods
  isExpired(): boolean {
    if (!this.props.expiresAt) {
      return false;
    }
    return new Date() > this.props.expiresAt;
  }

  hasReachedLimit(): boolean {
    if (this.props.maxRedemptions === undefined || this.props.maxRedemptions === null) {
      return false;
    }
    return this.redemptions >= this.props.maxRedemptions;
  }

  isValid(): boolean {
    return this.active && !this.isExpired() && !this.hasReachedLimit();
  }

  canBeRedeemed(): boolean {
    return this.isValid();
  }

  redeem(): void {
    if (!this.canBeRedeemed()) {
      throw new CouponValidationError("Cupom não pode ser resgatado");
    }
    this.props.redemptions = (this.props.redemptions ?? 0) + 1;
    this.props.updatedAt = new Date();
  }

  calculateDiscount(originalAmountCents: number): number {
    if (!this.isValid()) {
      return 0;
    }

    if (this.discountType === DiscountType.PERCENTAGE && this.percentage) {
      return Math.floor((originalAmountCents * this.percentage) / 100);
    }

    if (this.discountType === DiscountType.FIXED && this.amountCents) {
      return Math.min(this.amountCents, originalAmountCents);
    }

    return 0;
  }

  activate(): void {
    this.props.active = true;
    this.props.updatedAt = new Date();
  }

  deactivate(): void {
    this.props.active = false;
    this.props.updatedAt = new Date();
  }

  updateDetails(input: {
    description?: string;
    percentage?: number;
    amountCents?: number;
    maxRedemptions?: number;
    expiresAt?: Date;
    active?: boolean;
  }): void {
    if (input.description !== undefined) {
      this.props.description = input.description;
    }

    if (input.percentage !== undefined && this.discountType === DiscountType.PERCENTAGE) {
      if (input.percentage < 1 || input.percentage > 100) {
        throw new CouponValidationError("Percentual de desconto deve estar entre 1 e 100");
      }
      this.props.percentage = input.percentage;
    }

    if (input.amountCents !== undefined && this.discountType === DiscountType.FIXED) {
      if (input.amountCents < 1) {
        throw new CouponValidationError("Valor do desconto deve ser maior que zero");
      }
      this.props.amountCents = input.amountCents;
    }

    if (input.maxRedemptions !== undefined) {
      if (input.maxRedemptions < 0) {
        throw new CouponValidationError("Quantidade máxima de resgates não pode ser negativa");
      }
      this.props.maxRedemptions = input.maxRedemptions;
    }

    if (input.expiresAt !== undefined) {
      this.props.expiresAt = input.expiresAt;
    }

    if (input.active !== undefined) {
      this.props.active = input.active;
    }

    this.props.updatedAt = new Date();
  }

  toJSON() {
    return {
      id: this.id,
      merchantId: this.merchantId,
      courseId: this.courseId,
      code: this.code,
      description: this.description,
      discountType: this.discountType,
      percentage: this.percentage,
      amountCents: this.amountCents,
      maxRedemptions: this.maxRedemptions,
      redemptions: this.redemptions,
      expiresAt: this.expiresAt?.toISOString(),
      active: this.active,
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString(),
    };
  }
}

