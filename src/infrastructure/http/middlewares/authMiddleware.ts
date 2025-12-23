import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../../../config/env";
import { prisma } from "../../database/prismaClient";
import { makeLogger } from "../../logger";

const logger = makeLogger();

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const bearerToken =
    typeof authHeader === "string" && authHeader.startsWith("Bearer ")
      ? authHeader.replace("Bearer ", "")
      : null;

  // Suporte a autenticação via cookie HttpOnly (usado pelo /auth/login)
  const cookieToken =
    typeof (req as unknown as { cookies?: Record<string, unknown> }).cookies?.accessToken === "string"
      ? ((req as unknown as { cookies: { accessToken: string } }).cookies.accessToken as string)
      : null;

  const token = bearerToken ?? cookieToken;
  if (!token) {
    logger.warn({
      type: "AUTH_MISSING_TOKEN",
      message: "Missing authorization token",
    });
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as {
      sub: string;
      roles: string[];
      iat: number;
      exp: number;
    };

    const prismaAny = prisma as any;
    const user = await prismaAny.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        roles: true,
        merchantId: true,
        document: true,
      },
    } as any);
    if (!user) {
      logger.warn({
        type: "AUTH_USER_NOT_FOUND",
        message: "User not found",
        payload: { userId: payload.sub },
      });
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Preserva compatibilidade: alguns fluxos esperam kycStatus/documentType no req.user
    const userAny = user as any;
    req.user = {
      ...user,
      kycStatus: userAny.kycStatus,
      documentType: userAny.documentType,
    } as any;
    return next();
  } catch (err) {
    logger.error({
      type: "AUTH_JWT_INVALID",
      message: "JWT verification failed",
      error: err,
    });
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

// Alias for compatibility
export const ensureAuthenticated = authMiddleware;