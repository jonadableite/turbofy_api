import { prisma } from "./prismaClient";
import {
  UserPixKeyRecord,
  UserPixKeyRepositoryPort,
} from "../../ports/UserPixKeyRepositoryPort";

const mapPixKey = (pixKey: any): UserPixKeyRecord => ({
  id: pixKey.id,
  userId: pixKey.userId,
  type: pixKey.type,
  key: pixKey.key,
  status: pixKey.status,
  verificationSource: pixKey.verificationSource,
  createdAt: pixKey.createdAt,
  verifiedAt: pixKey.verifiedAt,
  rejectedAt: pixKey.rejectedAt,
  rejectionReason: pixKey.rejectionReason,
});

export class PrismaUserPixKeyRepository implements UserPixKeyRepositoryPort {
  async findByUserId(userId: string): Promise<UserPixKeyRecord | null> {
    const pixKey = await prisma.userPixKey.findUnique({
      where: { userId },
    });
    return pixKey ? mapPixKey(pixKey) : null;
  }

  async create(key: {
    userId: string;
    type: string;
    key: string;
    status: string;
    verificationSource?: string | null;
  }): Promise<UserPixKeyRecord> {
    const created = await prisma.userPixKey.create({
      data: {
        userId: key.userId,
        type: key.type,
        key: key.key,
        status: key.status,
        verificationSource: key.verificationSource,
      },
    });
    return mapPixKey(created);
  }

  async update(key: UserPixKeyRecord): Promise<UserPixKeyRecord> {
    const updated = await prisma.userPixKey.update({
      where: { userId: key.userId },
      data: {
        type: key.type,
        key: key.key,
        status: key.status,
        verificationSource: key.verificationSource,
        verifiedAt: key.verifiedAt,
        rejectedAt: key.rejectedAt,
        rejectionReason: key.rejectionReason,
      },
    });
    return mapPixKey(updated);
  }
}

