import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { AuthService, registerSchema, loginSchema } from '../../../application/services/AuthService';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { prisma } from '../../database/prismaClient';
import { EmailService } from '../../email/EmailService';
import { logger } from '../../logger';
import { trace } from '@opentelemetry/api';
// reCAPTCHA removido
import { generateCsrfToken } from '../../security/csrf';
import { authMiddleware } from '../middlewares/authMiddleware';

const authRouter = Router();
const authService = new AuthService();
const emailService = new EmailService();
const tracer = trace.getTracer('turbofy-auth');

// Rate limiter: mais permissivo em desenvolvimento
const isDevelopment = process.env.NODE_ENV === 'development';

// rate limiter: 10 requests / 10 minutes per IP for auth endpoints
const authLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutos
  max: isDevelopment ? 100 : 10, // 100 req/10min em dev, 10 em produção
  message: 'Too many auth attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  // Skip rate limiting para localhost em desenvolvimento
  skip: (req) => {
    if (isDevelopment) {
      const ip = req.ip || req.socket.remoteAddress || '';
      return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
    }
    return false;
  },
});

// MFA: stricter request rate limiting - mais permissivo em desenvolvimento
const mfaLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutos
  max: isDevelopment ? 50 : 5, // 50 req/10min em dev, 5 em produção
  message: 'Too many MFA requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  // Skip rate limiting para localhost em desenvolvimento
  skip: (req) => {
    if (isDevelopment) {
      const ip = req.ip || req.socket.remoteAddress || '';
      return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
    }
    return false;
  },
});

const mfaRequestSchema = z.object({
  email: z.string().email(),
});

const mfaVerifySchema = z.object({
  email: z.string().email(),
  otp: z.string().regex(/^\d{6}$/, 'OTP must be 6 digits'),
});

// Rate limiter mais permissivo para /auth/me (usado frequentemente)
const meLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minuto
  max: isDevelopment ? 100 : 30, // 100 req/min em dev, 30 em produção
  message: 'Too many requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    if (isDevelopment) {
      const ip = req.ip || req.socket.remoteAddress || '';
      return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
    }
    return false;
  },
});

// Brute-force helpers (duplicated from AuthService logic for route-level control)
async function checkLock(email: string, ip: string) {
  const now = new Date();
  const attempt = await prisma.authAttempt.findFirst({ where: { email, ip } });
  if (attempt?.lockedUntil && attempt.lockedUntil > now) {
    throw new Error('Too many attempts, temporarily locked');
  }
}

// GET /auth/me - Obter dados do usuário autenticado
authRouter.get('/me', meLimiter, authMiddleware, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Usuário não autenticado' } });
    }

    // Buscar dados completos do usuário
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        email: true,
        roles: true,
        document: true,
        phone: true,
        merchantId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: { code: 'USER_NOT_FOUND', message: 'Usuário não encontrado' } });
    }

    res.json({
      id: user.id,
      email: user.email,
      roles: user.roles,
      name: user.email.split('@')[0],
      document: user.document,
      phone: user.phone,
      merchantId: user.merchantId,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    });
  } catch (err) {
    logger.error({ err }, 'Erro ao buscar dados do usuário');
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Erro interno' } });
  }
});

// GET /api/auth/csrf - Gerar token CSRF
authRouter.get('/csrf', async (req: Request, res: Response) => {
  try {
    const csrfToken = generateCsrfToken();
    res.json({ csrfToken });
  } catch (err) {
    logger.error({ err }, 'Erro ao gerar token CSRF');
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Erro ao gerar token CSRF' } });
  }
});

// POST /auth/register - Registrar novo usuário
authRouter.post('/register', authLimiter, async (req: Request, res: Response) => {
  const span = tracer.startSpan('auth.register');
  try {
    const inputData = req.body;

    // reCAPTCHA removido: não validar token

    const input = registerSchema.parse(inputData);
    const tokens = await authService.register(input);

    // Configurar HttpOnly cookies
    const isProduction = process.env.NODE_ENV === 'production';
    res.cookie('accessToken', tokens.accessToken, {
      httpOnly: true,
      secure: isProduction, // HTTPS only em produção
      sameSite: 'strict',
      maxAge: 15 * 60 * 1000, // 15 minutos
      path: '/',
    });

    res.cookie('refreshToken', tokens.refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 dias
      path: '/',
    });

    res.status(201).json({
      success: true,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: 15 * 60, // 15 minutos em segundos
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Dados inválidos',
          details: err.issues,
        },
      });
    }
    logger.error({ err }, 'Erro no registro');
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Erro interno' } });
  } finally {
    span.end();
  }
});

// POST /auth/login - Login do usuário
authRouter.post('/login', authLimiter, async (req: Request, res: Response) => {
  const span = tracer.startSpan('auth.login');
  try {
    const inputData = req.body;
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';

    // reCAPTCHA removido: não validar token

    await checkLock(inputData.email, clientIp);
    const input = loginSchema.parse(inputData);
    const tokens = await authService.login(input, clientIp);

    // Configurar HttpOnly cookies
    const isProduction = process.env.NODE_ENV === 'production';
    res.cookie('accessToken', tokens.accessToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict',
      maxAge: 15 * 60 * 1000, // 15 minutos
      path: '/',
    });

    res.cookie('refreshToken', tokens.refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 dias
      path: '/',
    });

    res.json({
      success: true,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: 15 * 60, // 15 minutos em segundos
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Dados inválidos',
          details: err.issues,
        },
      });
    }
    if ((err as Error).message === 'Too many attempts, temporarily locked') {
      return res.status(429).json({ error: { code: 'TOO_MANY_ATTEMPTS', message: 'Muitas tentativas. Tente novamente mais tarde.' } });
    }
    if ((err as Error).message === 'Invalid credentials') {
      return res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Credenciais inválidas' } });
    }
    logger.error({ err }, 'Erro no login');
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Erro interno' } });
  } finally {
    span.end();
  }
});

// POST /auth/logout - Logout do usuário (não exige autenticação obrigatória)
authRouter.post('/logout', async (req: Request, res: Response) => {
  try {
    // Tentar invalidar token se existir (opcional)
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.replace('Bearer ', '');
      // TODO: Invalidar token no servidor (adicionar à blacklist)
      logger.info({ tokenLength: token.length }, 'Token invalidated on logout');
    }

    // Sempre limpar cookies (mesmo sem token válido)
    res.clearCookie('accessToken', { path: '/' });
    res.clearCookie('refreshToken', { path: '/' });
    
    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, 'Erro no logout');
    // Mesmo em caso de erro, limpar cookies
    res.clearCookie('accessToken', { path: '/' });
    res.clearCookie('refreshToken', { path: '/' });
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Erro interno' } });
  }
});

// POST /auth/refresh - Refresh token
authRouter.post('/refresh', async (req: Request, res: Response) => {
  try {
    const refreshToken = req.cookies.refreshToken || (req.body && req.body.refreshToken);
    
    if (!refreshToken) {
      return res.status(401).json({ error: { code: 'REFRESH_TOKEN_MISSING', message: 'Refresh token não fornecido' } });
    }

    const tokens = await authService.refreshToken(refreshToken);

    // Configurar novos cookies
    const isProduction = process.env.NODE_ENV === 'production';
    res.cookie('accessToken', tokens.accessToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict',
      maxAge: 15 * 60 * 1000,
      path: '/',
    });

    res.cookie('refreshToken', tokens.refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/',
    });

    res.json({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: 15 * 60,
    });
  } catch (err) {
    logger.error({ err }, 'Erro ao renovar token');
    res.status(401).json({ error: { code: 'INVALID_REFRESH_TOKEN', message: 'Token de renovação inválido' } });
  }
});

// POST /auth/mfa/request - Solicitar OTP por e-mail
authRouter.post('/mfa/request', mfaLimiter, async (req: Request, res: Response) => {
  const span = tracer.startSpan('auth.mfa.request');
  try {
    const input = mfaRequestSchema.parse(req.body);
    const otp = await authService.requestMfa(input.email);
    if (otp) {
    await emailService.sendOtpEmail(input.email, otp);
    }
    res.json({ success: true });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Email inválido' } });
    }
    if (err instanceof Error && err.message.includes("Too many attempts")) {
      return res.status(429).json({ error: "Too many attempts, try later" });
    }
    logger.error({ err }, 'Erro ao solicitar MFA');
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Erro interno' } });
        } finally {
          span.end();
        }
});

// POST /auth/mfa/verify - Verificar OTP e obter tokens
authRouter.post('/mfa/verify', mfaLimiter, async (req: Request, res: Response) => {
  const span = tracer.startSpan('auth.mfa.verify');
  try {
    const input = mfaVerifySchema.parse(req.body);
    const tokens = await authService.verifyMfa(input.email, input.otp);

    // Configurar HttpOnly cookies
    const isProduction = process.env.NODE_ENV === 'production';
    res.cookie('accessToken', tokens.accessToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict',
      maxAge: 15 * 60 * 1000,
      path: '/',
    });

    res.cookie('refreshToken', tokens.refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/',
    });

    res.json({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: 15 * 60,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Dados inválidos' } });
    }
    if ((err as Error).message.includes('Invalid') || (err as Error).message.includes('expired')) {
      return res.status(401).json({ error: { code: 'INVALID_OTP', message: 'OTP inválido ou expirado' } });
    }
    logger.error({ err }, 'Erro ao verificar MFA');
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Erro interno' } });
  } finally {
    span.end();
  }
});

// POST /auth/forgot-password - Solicitar recuperação de senha
authRouter.post('/forgot-password', authLimiter, async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    // Verificar se usuário existe (não revelar se existe ou não por segurança)
    const user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      // Gerar token de recuperação
      const resetToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 1); // Expira em 1 hora

      await prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt,
        },
      });

      // Enviar email de recuperação
      const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3001'}/reset-password?token=${resetToken}`;
      await emailService.sendPasswordResetEmail(user.email, resetUrl);
    }

    // Sempre retornar sucesso (não revelar se email existe)
    res.json({ success: true, message: 'Se o email existir, você receberá instruções de recuperação' });
  } catch (err) {
    logger.error({ err }, 'Erro ao solicitar recuperação de senha');
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Erro interno' } });
  }
});

export { authRouter };
