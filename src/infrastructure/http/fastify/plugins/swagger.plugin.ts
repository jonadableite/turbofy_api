/**
 * @file Swagger/OpenAPI Plugin for Fastify
 * @description Provides API documentation using @fastify/swagger and @fastify/swagger-ui
 * 
 * @maintainability Centralized API documentation configuration
 */

import fp from 'fastify-plugin';
import { FastifyPluginAsync } from 'fastify';

const swaggerPlugin: FastifyPluginAsync = async (fastify) => {
  // Register @fastify/swagger for OpenAPI spec generation
  await fastify.register(import('@fastify/swagger'), {
    openapi: {
      openapi: '3.0.0',
      info: {
        title: 'Turbofy API',
        version: '1.0.0',
        description: 'Gateway de Pagamentos e Marketplace de Infoprodutos',
        contact: {
          name: 'Turbofy Team',
          email: 'suporte@turbofy.com',
        },
      },
      servers: [
        { url: 'http://localhost:3000', description: 'Development' },
        { url: 'https://api.turbofypay.com', description: 'Production' },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
          clientCredentials: {
            type: 'apiKey',
            in: 'header',
            name: 'x-client-id',
            description: 'Client ID for integrator authentication',
          },
        },
        schemas: {
          Error: {
            type: 'object',
            properties: {
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                  details: { type: 'object' },
                },
                required: ['code', 'message'],
              },
            },
          },
          CreateChargeRequest: {
            type: 'object',
            properties: {
              merchantId: { type: 'string', format: 'uuid' },
              amountCents: { type: 'integer', minimum: 1 },
              currency: { type: 'string', enum: ['BRL'], default: 'BRL' },
              description: { type: 'string', maxLength: 255 },
              method: { type: 'string', enum: ['PIX', 'BOLETO'] },
              expiresAt: { type: 'string', format: 'date-time' },
              externalRef: { type: 'string', maxLength: 128 },
              metadata: { type: 'object', additionalProperties: true },
            },
            required: ['merchantId', 'amountCents'],
          },
          CreateChargeResponse: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              merchantId: { type: 'string', format: 'uuid' },
              amountCents: { type: 'integer' },
              currency: { type: 'string', enum: ['BRL'] },
              description: { type: 'string', nullable: true },
              status: { type: 'string', enum: ['PENDING', 'PAID', 'EXPIRED', 'CANCELED'] },
              method: { type: 'string', enum: ['PIX', 'BOLETO'], nullable: true },
              expiresAt: { type: 'string', format: 'date-time', nullable: true },
              idempotencyKey: { type: 'string' },
              externalRef: { type: 'string', nullable: true },
              metadata: { type: 'object', nullable: true },
              pix: {
                type: 'object',
                properties: {
                  qrCode: { type: 'string' },
                  copyPaste: { type: 'string' },
                  expiresAt: { type: 'string', format: 'date-time' },
                },
              },
              boleto: {
                type: 'object',
                properties: {
                  boletoUrl: { type: 'string' },
                  expiresAt: { type: 'string', format: 'date-time' },
                },
              },
              createdAt: { type: 'string', format: 'date-time' },
              updatedAt: { type: 'string', format: 'date-time' },
            },
            required: ['id', 'merchantId', 'amountCents', 'currency', 'status', 'idempotencyKey', 'createdAt', 'updatedAt'],
          },
          LoginRequest: {
            type: 'object',
            properties: {
              email: { type: 'string', format: 'email' },
              password: { type: 'string', minLength: 8 },
            },
            required: ['email', 'password'],
          },
          LoginResponse: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              accessToken: { type: 'string' },
              refreshToken: { type: 'string' },
              expiresIn: { type: 'integer' },
            },
          },
          RegisterRequest: {
            type: 'object',
            properties: {
              email: { type: 'string', format: 'email' },
              password: { type: 'string', minLength: 8 },
              name: { type: 'string' },
            },
            required: ['email', 'password'],
          },
          User: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              email: { type: 'string', format: 'email' },
              name: { type: 'string' },
              roles: { type: 'array', items: { type: 'string' } },
              merchantId: { type: 'string', format: 'uuid', nullable: true },
              createdAt: { type: 'string', format: 'date-time' },
              updatedAt: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
      tags: [
        { name: 'Auth', description: 'Authentication endpoints' },
        { name: 'Charges', description: 'Payment charges management' },
        { name: 'Checkout', description: 'Checkout session management' },
        { name: 'Settlements', description: 'Settlement/payout management' },
        { name: 'Reconciliations', description: 'Bank reconciliation' },
        { name: 'Webhooks', description: 'Webhook management' },
        { name: 'Studio', description: 'Course/product management' },
        { name: 'Dashboard', description: 'Dashboard analytics' },
        { name: 'Admin', description: 'Administrative operations' },
      ],
    },
  });

  // Register @fastify/swagger-ui for documentation UI
  await fastify.register(import('@fastify/swagger-ui'), {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
      persistAuthorization: true,
    },
    staticCSP: true,
    transformSpecification: (swaggerObject) => swaggerObject,
    transformSpecificationClone: true,
  });

  fastify.log.info({ type: 'SWAGGER_REGISTERED' }, 'Swagger documentation available at /docs');
};

export default fp(swaggerPlugin, {
  name: 'swagger-plugin',
  fastify: '5.x',
});
