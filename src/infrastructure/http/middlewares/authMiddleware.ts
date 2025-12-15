import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import pino from 'pino';
import { env } from '../../../config/env';
import { prisma } from '../../database/prismaClient';

const logger = pino({
  name: 'auth-middleware',
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
});

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  const bearerToken =
    typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
      ? authHeader.replace('Bearer ', '')
      : null;

  // Suporte a autenticação via cookie HttpOnly (usado pelo /auth/login)
  const cookieToken =
    typeof (req as unknown as { cookies?: Record<string, unknown> }).cookies
      ?.accessToken === 'string'
      ? ((req as unknown as { cookies: { accessToken: string } }).cookies
          .accessToken as string)
      : null;

  const token = bearerToken ?? cookieToken;
  if (!token) {
    logger.warn({ msg: 'Missing authorization token' });
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as {
      sub: string;
      roles: string[];
      iat: number;
      exp: number;
    };

    const user = await prisma.user.findUnique({ where: { id: payload.sub }, select: { id: true, email: true, roles: true, merchantId: true } });
    if (!user) {
      logger.warn({ msg: 'User not found', userId: payload.sub });
      return res.status(401).json({ error: 'Unauthorized' });
    }

    req.user = user;
    return next();
  } catch (err) {
    logger.error({ err }, 'JWT verification failed');
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Alias for compatibility
export const ensureAuthenticated = authMiddleware;