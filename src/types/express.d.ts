import { User as PrismaUser } from "@prisma/client";

declare global {
  namespace Express {
    interface Request {
      auth?: {
        userId: string;
        role: string;
        orgId?: string;
      };
      user?: {
        id: string;
        email: string;
        roles: string[];
        merchantId: string | null;
        kycStatus?: string;
        documentType?: string | null;
        document?: string | null;
      };
    }
  }
}

export {};
