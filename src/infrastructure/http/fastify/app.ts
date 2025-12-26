/**
 * @file Fastify Application Configuration
 * @description Main Fastify application builder with all plugins and configurations
 * 
 * @security Applies Helmet for secure HTTP headers, CORS with explicit origin, rate limiting
 * @performance Uses Fastify which is 2-3x faster than Express, with native Pino logging
 * @maintainability Plugin-based architecture with clear separation of concerns
 * @testability Server exported for integration testing via fastify.inject()
 */

import Fastify, { FastifyInstance, FastifyServerOptions } from 'fastify';
import { env } from '../../../config/env';

export interface AppOptions extends FastifyServerOptions {
  /** Skip plugin registration for testing */
  skipPlugins?: boolean;
}

/**
 * Build and configure the Fastify application
 * @param options - Fastify server options
 * @returns Configured Fastify instance
 */
export const buildApp = async (options: AppOptions = {}): Promise<FastifyInstance> => {
  const { skipPlugins = false, ...fastifyOptions } = options;

  const app = Fastify({
    logger: {
      level: env.NODE_ENV === 'development' ? 'info' : 'warn',
      transport: env.NODE_ENV === 'development'
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
      redact: ['req.headers.authorization', 'req.headers["x-client-secret"]'],
      serializers: {
        req(request) {
          return {
            method: request.method,
            url: request.url?.split('?')[0],
            host: request.hostname,
            remoteAddress: request.ip,
          };
        },
        res(reply) {
          return {
            statusCode: reply.statusCode,
          };
        },
      },
    },
    trustProxy: true, // Para funcionar atrás de Cloudflare/NGINX
    disableRequestLogging: env.NODE_ENV === 'development',
    ...fastifyOptions,
  });

  if (!skipPlugins) {
    // Register core plugins
    await registerCorePlugins(app);
    
    // Register custom plugins
    await registerCustomPlugins(app);
    
    // Register routes
    await registerRoutes(app);
    
    // Register error handlers
    registerErrorHandlers(app);
  }

  return app;
};

/**
 * Register core Fastify plugins
 */
const registerCorePlugins = async (app: FastifyInstance): Promise<void> => {
  // @fastify/sensible - Provides utilities like httpErrors, assert, etc.
  await app.register(import('@fastify/sensible'));

  // @fastify/cookie - Cookie parsing and setting
  await app.register(import('@fastify/cookie'), {
    secret: env.JWT_SECRET,
    parseOptions: {},
  });

  // @fastify/cors - Cross-Origin Resource Sharing
  const corsOrigin = process.env.CORS_ORIGIN || '*';
  const allowedOrigins = corsOrigin === '*' ? '*' : corsOrigin.split(',').map((o) => o.trim());

  await app.register(import('@fastify/cors'), {
    origin: (origin, callback) => {
      // Allow requests without origin (Postman, mobile apps)
      if (!origin) {
        return callback(null, true);
      }

      // Allow all origins if configured as '*'
      if (allowedOrigins === '*') {
        return callback(null, true);
      }

      // Check if origin is in allowed list
      if (Array.isArray(allowedOrigins) && allowedOrigins.includes(origin)) {
        return callback(null, origin);
      }

      callback(new Error('Not allowed by CORS'), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'x-client-id',
      'x-client-secret',
      'x-idempotency-key',
      'X-CSRF-Token',
      'x-csrf-token',
    ],
    exposedHeaders: ['Set-Cookie'],
  });

  // @fastify/helmet - Security headers
  await app.register(import('@fastify/helmet'), {
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: false,
  });

  // @fastify/rate-limit - Rate limiting
  await app.register(import('@fastify/rate-limit'), {
    global: true,
    max: env.NODE_ENV === 'development' ? 1000 : 100,
    timeWindow: '1 minute',
    skipOnError: true,
    keyGenerator: (request) => {
      return request.ip || request.headers['x-forwarded-for']?.toString() || 'unknown';
    },
  });

  // @fastify/multipart - File uploads
  await app.register(import('@fastify/multipart'), {
    limits: {
      fieldNameSize: 100,
      fieldSize: 100 * 1024, // 100KB
      fields: 10,
      fileSize: 50 * 1024 * 1024, // 50MB
      files: 5,
      headerPairs: 2000,
    },
  });

  // @fastify/static - Serve static files
  await app.register(import('@fastify/static'), {
    root: require('path').join(__dirname, '../../../../uploads'),
    prefix: '/uploads/',
    decorateReply: false,
  });
};

/**
 * Register custom application plugins
 */
const registerCustomPlugins = async (app: FastifyInstance): Promise<void> => {
  // Prisma plugin
  await app.register(import('./plugins/prisma.plugin'));

  // Authentication plugin
  await app.register(import('./plugins/auth.plugin'));

  // Swagger/OpenAPI documentation
  await app.register(import('./plugins/swagger.plugin'));
};

/**
 * Register all application routes
 */
const registerRoutes = async (app: FastifyInstance): Promise<void> => {
  await app.register(import('./routes'), { prefix: '/' });
};

/**
 * Register global error handlers
 */
const registerErrorHandlers = (app: FastifyInstance): void => {
  // Global error handler
  app.setErrorHandler((error, request, reply) => {
    const statusCode = error.statusCode || 500;
    const errorCode = (error as { code?: string }).code || 'INTERNAL_ERROR';

    request.log.error({
      type: 'REQUEST_ERROR',
      error: {
        message: error.message,
        code: errorCode,
        stack: env.NODE_ENV === 'development' ? error.stack : undefined,
      },
      requestId: request.id,
      url: request.url,
      method: request.method,
    });

    // Don't expose internal errors in production
    const message = statusCode >= 500 && env.NODE_ENV === 'production'
      ? 'Internal Server Error'
      : error.message;

    return reply.status(statusCode).send({
      error: {
        code: errorCode,
        message,
        ...(env.NODE_ENV === 'development' && { stack: error.stack }),
      },
    });
  });

  // 404 handler
  app.setNotFoundHandler((request, reply) => {
    return reply.status(404).send({
      error: {
        code: 'NOT_FOUND',
        message: `Route ${request.method} ${request.url} not found`,
      },
    });
  });
};

export { buildApp as default };
