import { PrismaClient } from "@prisma/client";
import { ApiKey, ApiKeyOrigin } from "../../../domain/entities/ApiKey";
import { ApiKeyRepository } from "../../../ports/repositories/ApiKeyRepository";

export class PrismaApiKeyRepository implements ApiKeyRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async save(apiKey: ApiKey): Promise<ApiKey> {
    const data = {
      id: apiKey.id,
      merchantId: apiKey.merchantId,
      keyHash: apiKey.keyHash,
      keyPrefix: apiKey.keyPrefix,
      keySuffix: apiKey.keySuffix,
      name: apiKey.name,
      origin: apiKey.origin,
      permissions: apiKey.permissions,
      lastUsedAt: apiKey.lastUsedAt,
      expiresAt: apiKey.expiresAt,
      revokedAt: apiKey.revokedAt,
      revokedBy: apiKey.revokedBy,
    };

    const savedApiKey = await this.prisma.apiKey.create({
      data,
    });

    return this.mapToEntity(savedApiKey);
  }

  async findById(id: string): Promise<ApiKey | null> {
    const apiKey = await this.prisma.apiKey.findUnique({
      where: { id },
    });

    if (!apiKey) return null;

    return this.mapToEntity(apiKey);
  }

  async findByMerchantId(merchantId: string): Promise<ApiKey[]> {
    const apiKeys = await this.prisma.apiKey.findMany({
      where: { merchantId },
      orderBy: { createdAt: "desc" },
    });

    return apiKeys.map((apiKey) => this.mapToEntity(apiKey));
  }

  async findByKeyHash(keyHash: string): Promise<ApiKey | null> {
    const apiKey = await this.prisma.apiKey.findUnique({
      where: { keyHash },
    });

    if (!apiKey) return null;

    return this.mapToEntity(apiKey);
  }

  async findActiveByMerchantId(merchantId: string): Promise<ApiKey[]> {
    const apiKeys = await this.prisma.apiKey.findMany({
      where: {
        merchantId,
        revokedAt: null,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } },
        ],
      },
      orderBy: { createdAt: "desc" },
    });

    return apiKeys.map((apiKey) => this.mapToEntity(apiKey));
  }

  async update(apiKey: ApiKey): Promise<ApiKey> {
    const updatedApiKey = await this.prisma.apiKey.update({
      where: { id: apiKey.id },
      data: {
        name: apiKey.name,
        permissions: apiKey.permissions,
        lastUsedAt: apiKey.lastUsedAt,
        expiresAt: apiKey.expiresAt,
        revokedAt: apiKey.revokedAt,
        revokedBy: apiKey.revokedBy,
        updatedAt: new Date(),
      },
    });

    return this.mapToEntity(updatedApiKey);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.apiKey.delete({
      where: { id },
    });
  }

  private mapToEntity(prismaApiKey: {
    id: string;
    merchantId: string;
    keyHash: string;
    keyPrefix: string;
    keySuffix: string;
    name: string | null;
    origin: string;
    permissions: string[];
    lastUsedAt: Date | null;
    expiresAt: Date | null;
    revokedAt: Date | null;
    revokedBy: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): ApiKey {
    return ApiKey.fromPersistence({
      id: prismaApiKey.id,
      merchantId: prismaApiKey.merchantId,
      keyHash: prismaApiKey.keyHash,
      keyPrefix: prismaApiKey.keyPrefix,
      keySuffix: prismaApiKey.keySuffix,
      name: prismaApiKey.name,
      origin: prismaApiKey.origin as ApiKeyOrigin,
      permissions: prismaApiKey.permissions,
      lastUsedAt: prismaApiKey.lastUsedAt,
      expiresAt: prismaApiKey.expiresAt,
      revokedAt: prismaApiKey.revokedAt,
      revokedBy: prismaApiKey.revokedBy,
      createdAt: prismaApiKey.createdAt,
      updatedAt: prismaApiKey.updatedAt,
    });
  }
}

