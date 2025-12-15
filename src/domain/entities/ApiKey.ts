import { createHash, randomBytes } from "crypto";

export type ApiKeyOrigin = "DASHBOARD" | "CLI" | "API";

export interface ApiKeyProps {
  id: string;
  merchantId: string;
  keyHash: string;
  keyPrefix: string;
  keySuffix: string;
  name?: string | null;
  origin: ApiKeyOrigin;
  permissions: string[];
  lastUsedAt?: Date | null;
  expiresAt?: Date | null;
  revokedAt?: Date | null;
  revokedBy?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateApiKeyInput {
  merchantId: string;
  name?: string;
  origin?: ApiKeyOrigin;
  permissions?: string[];
  expiresAt?: Date;
}

export interface CreateApiKeyResult {
  apiKey: ApiKey;
  rawKey: string; // Chave em texto plano (mostrada apenas uma vez)
}

const API_KEY_PREFIX = "tb_live_";
const API_KEY_BYTES = 32;

export class ApiKey {
  readonly id: string;
  readonly merchantId: string;
  readonly keyHash: string;
  readonly keyPrefix: string;
  readonly keySuffix: string;
  readonly name: string | null;
  readonly origin: ApiKeyOrigin;
  readonly permissions: string[];
  readonly lastUsedAt: Date | null;
  readonly expiresAt: Date | null;
  readonly revokedAt: Date | null;
  readonly revokedBy: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  private constructor(props: ApiKeyProps) {
    this.id = props.id;
    this.merchantId = props.merchantId;
    this.keyHash = props.keyHash;
    this.keyPrefix = props.keyPrefix;
    this.keySuffix = props.keySuffix;
    this.name = props.name ?? null;
    this.origin = props.origin;
    this.permissions = props.permissions;
    this.lastUsedAt = props.lastUsedAt ?? null;
    this.expiresAt = props.expiresAt ?? null;
    this.revokedAt = props.revokedAt ?? null;
    this.revokedBy = props.revokedBy ?? null;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  static create(input: CreateApiKeyInput): CreateApiKeyResult {
    const rawKeyBody = randomBytes(API_KEY_BYTES).toString("hex");
    const rawKey = `${API_KEY_PREFIX}${rawKeyBody}`;
    const keyHash = ApiKey.hashKey(rawKey);
    const keySuffix = rawKeyBody.slice(-4);

    const now = new Date();
    const apiKey = new ApiKey({
      id: crypto.randomUUID(),
      merchantId: input.merchantId,
      keyHash,
      keyPrefix: API_KEY_PREFIX,
      keySuffix,
      name: input.name ?? null,
      origin: input.origin ?? "DASHBOARD",
      permissions: input.permissions ?? [],
      lastUsedAt: null,
      expiresAt: input.expiresAt ?? null,
      revokedAt: null,
      revokedBy: null,
      createdAt: now,
      updatedAt: now,
    });

    return { apiKey, rawKey };
  }

  static fromPersistence(props: ApiKeyProps): ApiKey {
    return new ApiKey(props);
  }

  static hashKey(rawKey: string): string {
    return createHash("sha256").update(rawKey).digest("hex");
  }

  static verifyKey(rawKey: string, keyHash: string): boolean {
    return ApiKey.hashKey(rawKey) === keyHash;
  }

  isActive(): boolean {
    if (this.revokedAt !== null) {
      return false;
    }
    if (this.expiresAt !== null && this.expiresAt < new Date()) {
      return false;
    }
    return true;
  }

  isRevoked(): boolean {
    return this.revokedAt !== null;
  }

  isExpired(): boolean {
    return this.expiresAt !== null && this.expiresAt < new Date();
  }

  hasPermission(permission: string): boolean {
    if (this.permissions.length === 0) {
      return true; // Sem restrições = acesso total
    }
    return this.permissions.includes(permission) || this.permissions.includes("*");
  }

  revoke(userId: string): ApiKey {
    const now = new Date();
    return new ApiKey({
      ...this.toProps(),
      revokedAt: now,
      revokedBy: userId,
      updatedAt: now,
    });
  }

  updateLastUsed(): ApiKey {
    const now = new Date();
    return new ApiKey({
      ...this.toProps(),
      lastUsedAt: now,
      updatedAt: now,
    });
  }

  getMaskedKey(): string {
    return `${this.keyPrefix}...${this.keySuffix}`;
  }

  toProps(): ApiKeyProps {
    return {
      id: this.id,
      merchantId: this.merchantId,
      keyHash: this.keyHash,
      keyPrefix: this.keyPrefix,
      keySuffix: this.keySuffix,
      name: this.name,
      origin: this.origin,
      permissions: this.permissions,
      lastUsedAt: this.lastUsedAt,
      expiresAt: this.expiresAt,
      revokedAt: this.revokedAt,
      revokedBy: this.revokedBy,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}

