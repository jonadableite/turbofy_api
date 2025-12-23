/**
 * Rotas da API (/api/*)
 * Endpoints auxiliares como CSRF tokens
 */

import { Router, Request, Response } from 'express';
import { generateCsrfToken } from '../../security/csrf';
import { logger } from '../../logger';
import { adminRouter } from './adminRoutes';
import { createSecureRateLimiter } from '../utils/rateLimitHelper';

const apiRouter = Router();

// Rate limiter para endpoints da API - mais permissivo em desenvolvimento
const isDevelopment = process.env.NODE_ENV === 'development';
const apiLimiter = createSecureRateLimiter({
  windowMs: 1 * 60 * 1000, // 1 minuto
  max: isDevelopment ? 100 : 20, // 100 req/min em dev, 20 em produção
  message: 'Too many requests, please try again later.',
  // Skip rate limiting para localhost em desenvolvimento
  skip: (req) => {
    if (isDevelopment) {
      const ip = req.ip || req.socket.remoteAddress || '';
      return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
    }
    return false;
  },
});

/**
 * GET /api/auth/csrf
 * Gera e retorna um token CSRF para proteção contra ataques CSRF
 */
apiRouter.get('/auth/csrf', apiLimiter, (req: Request, res: Response) => {
  try {
    const csrfToken = generateCsrfToken();
    
    logger.debug({ ip: req.ip }, 'CSRF token generated');
    
    res.status(200).json({ csrfToken });
  } catch (error) {
    logger.error({ error }, 'Error generating CSRF token');
    res.status(500).json({ error: 'Failed to generate CSRF token' });
  }
});

apiRouter.use('/admin', apiLimiter, adminRouter);

export { apiRouter };

