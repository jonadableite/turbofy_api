/**
 * @file Authentication Plugin for Fastify
 * @description Provides JWT and Better Auth authentication for Fastify routes
 * 
 * @security JWT verification with proper error handling
 * @maintainability Single authentication logic shared across all protected routes
 */

import fp from 'fastify-plugin';
import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import { env } from '../../../../config/env';
import { auth } from '../../../auth/better-auth';

// User type from authentication
export interface AuthenticatedUser {
  id: string;
  email: string;
  roles: string[];
  role?: string;
  merchantId?: string | null;
  document?: string | null;
  documentType?: string | null;
  kycStatus?: string | null;
  phone?: string | null;
  name?: string | null;
  image?: string | null;
  emailVerified?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

// Extend Fastify types
declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthenticatedUser;
    rawBody?: Buffer;
  }

  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    authenticateOptional: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    authenticateAdmin: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

const authPlugin: FastifyPluginAsync = async (fastify) => {
  // Decorate request with user property
  fastify.decorateRequest('user', null);
  fastify.decorateRequest('rawBody', null);

  /**
   * Required authentication handler
   * Throws 401 if no valid token is present
   */
  const authenticate = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const token = extractToken(request);

    if (!token) {
      request.log.warn({ type: 'AUTH_MISSING_TOKEN' }, 'Missing authorization token');
      return reply.status(401).send({
        error: { code: 'UNAUTHORIZED', message: 'Missing authorization token' },
      });
    }

    try {
      const user = await verifyToken(token, fastify);
      if (!user) {
        return reply.status(401).send({
          error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token' },
        });
      }
      request.user = user;
    } catch (error) {
      request.log.error({ type: 'AUTH_JWT_INVALID', error }, 'JWT verification failed');
      return reply.status(401).send({
        error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token' },
      });
    }
  };

  /**
   * Optional authentication handler
   * Sets user if token is valid, but doesn't block if no token
   */
  const authenticateOptional = async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    const token = extractToken(request);

    if (!token) {
      return; // No token, but that's okay
    }

    try {
      const user = await verifyToken(token, fastify);
      if (user) {
        request.user = user;
      }
    } catch {
      // Token invalid, but optional so we continue
    }
  };

  /**
   * Admin-only authentication handler
   * Requires valid token AND admin role
   */
  const authenticateAdmin = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    await authenticate(request, reply);
    
    if (reply.sent) return; // Already responded with error

    const user = request.user;
    if (!user) {
      return reply.status(401).send({
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      });
    }

    const isAdmin = user.roles?.includes('ADMIN') || user.role === 'ADMIN';
    if (!isAdmin) {
      request.log.warn({ type: 'AUTH_FORBIDDEN', userId: user.id }, 'Admin access denied');
      return reply.status(403).send({
        error: { code: 'FORBIDDEN', message: 'Admin access required' },
      });
    }
  };

  // Decorate fastify with authentication methods
  fastify.decorate('authenticate', authenticate);
  fastify.decorate('authenticateOptional', authenticateOptional);
  fastify.decorate('authenticateAdmin', authenticateAdmin);

  // Better Auth handler for /api/auth/* routes
  fastify.all('/api/auth/*', async (request, reply) => {
    try {
      const response = await auth.handler(request.raw);
      
      // Forward response headers
      response.headers.forEach((value, key) => {
        reply.header(key, value);
      });

      // Forward status and body
      const body = await response.text();
      return reply.status(response.status).send(body ? JSON.parse(body) : null);
    } catch (error) {
      request.log.error({ type: 'BETTER_AUTH_ERROR', error }, 'Better Auth handler failed');
      return reply.status(500).send({
        error: { code: 'AUTH_ERROR', message: 'Authentication service error' },
      });
    }
  });
};

/**
 * Extract JWT token from request
 */
const extractToken = (request: FastifyRequest): string | null => {
  // Try Authorization header first
  const authHeader = request.headers.authorization;
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    return authHeader.replace('Bearer ', '');
  }

  // Try cookie as fallback
  const cookies = request.cookies;
  if (cookies && typeof cookies.accessToken === 'string') {
    return cookies.accessToken;
  }

  return null;
};

/**
 * Verify JWT token and return user
 */
const verifyToken = async (
  token: string,
  fastify: { prisma: { user: { findUnique: (args: { where: { id: string }; select: Record<string, boolean> }) => Promise<unknown> } } }
): Promise<AuthenticatedUser | null> => {
  const payload = jwt.verify(token, env.JWT_SECRET) as {
    sub: string;
    roles?: string[];
    iat: number;
    exp: number;
  };

  const user = await fastify.prisma.user.findUnique({
    where: { id: payload.sub },
    select: {
      id: true,
      email: true,
      role: true,
      merchantId: true,
      document: true,
      documentType: true,
      kycStatus: true,
      phone: true,
      name: true,
      image: true,
      emailVerified: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!user) {
    return null;
  }

  const userRecord = user as Record<string, unknown>;
  const role = userRecord.role as string | undefined;
  
  return {
    id: userRecord.id as string,
    email: userRecord.email as string,
    roles: payload.roles || (role ? [role] : []),
    role: role,
    merchantId: userRecord.merchantId as string | null,
    document: userRecord.document as string | null,
    documentType: userRecord.documentType as string | null,
    kycStatus: userRecord.kycStatus as string | null,
    phone: userRecord.phone as string | null,
    name: userRecord.name as string | null,
    image: userRecord.image as string | null,
    emailVerified: userRecord.emailVerified as boolean,
    createdAt: userRecord.createdAt as Date,
    updatedAt: userRecord.updatedAt as Date,
  };
};

/**
 * Parse roles from string or array
 */
export const parseRoles = (role: string | string[] | undefined): string[] => {
  if (!role) return [];
  if (Array.isArray(role)) return role;
  // Handle comma-separated roles
  if (role.includes(',')) {
    return role.split(',').map((r) => r.trim());
  }
  return [role];
};

export default fp(authPlugin, {
  name: 'auth-plugin',
  fastify: '5.x',
  dependencies: ['prisma-plugin'],
});
