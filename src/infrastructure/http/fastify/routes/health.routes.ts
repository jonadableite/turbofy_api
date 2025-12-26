/**
 * @file Health Check Routes
 * @description Health check and metrics endpoints
 */

import { FastifyPluginAsync } from 'fastify';
import { register } from 'prom-client';

const healthRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * Health check endpoint
   */
  fastify.get('/healthz', {
    schema: {
      tags: ['Health'],
      summary: 'Health check endpoint',
      response: {
        200: {
          type: 'object',
          properties: {
            ok: { type: 'boolean' },
            timestamp: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
  }, async (_request, reply) => {
    return reply.send({
      ok: true,
      timestamp: new Date().toISOString(),
    });
  });

  /**
   * Prometheus metrics endpoint
   */
  fastify.get('/metrics', {
    schema: {
      tags: ['Health'],
      summary: 'Prometheus metrics endpoint',
    },
  }, async (_request, reply) => {
    reply.header('Content-Type', register.contentType);
    return reply.send(await register.metrics());
  });

  /**
   * Ready check - verifies database connection
   */
  fastify.get('/ready', {
    schema: {
      tags: ['Health'],
      summary: 'Readiness check with database verification',
      response: {
        200: {
          type: 'object',
          properties: {
            ok: { type: 'boolean' },
            database: { type: 'boolean' },
            timestamp: { type: 'string', format: 'date-time' },
          },
        },
        503: {
          type: 'object',
          properties: {
            ok: { type: 'boolean' },
            database: { type: 'boolean' },
            error: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    try {
      // Check database connection
      await fastify.prisma.$queryRaw`SELECT 1`;
      
      return reply.send({
        ok: true,
        database: true,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      request.log.error({ type: 'READY_CHECK_FAILED', error }, 'Database health check failed');
      return reply.status(503).send({
        ok: false,
        database: false,
        error: 'Database connection failed',
      });
    }
  });
};

export default healthRoutes;
