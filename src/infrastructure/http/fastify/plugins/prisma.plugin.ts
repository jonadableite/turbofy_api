/**
 * @file Prisma Plugin for Fastify
 * @description Integrates PrismaClient with Fastify for database access
 * 
 * @maintainability Single PrismaClient instance shared across all routes
 * @testability Can be mocked for unit tests
 */

import fp from 'fastify-plugin';
import { FastifyPluginAsync } from 'fastify';
import { PrismaClient } from '@prisma/client';

// Extend Fastify types to include prisma
declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
  }
}

// Singleton Prisma client
let prismaClient: PrismaClient | null = null;

const getPrismaClient = (): PrismaClient => {
  if (!prismaClient) {
    prismaClient = new PrismaClient({
      log: process.env.NODE_ENV === 'development' 
        ? ['query', 'error', 'warn'] 
        : ['error'],
    });
  }
  return prismaClient;
};

const prismaPlugin: FastifyPluginAsync = async (fastify) => {
  const prisma = getPrismaClient();

  // Decorate fastify instance with prisma client
  fastify.decorate('prisma', prisma);

  // Connect to database on startup
  fastify.addHook('onReady', async () => {
    try {
      await prisma.$connect();
      fastify.log.info({ type: 'PRISMA_CONNECTED' }, 'Prisma connected to database');
    } catch (error) {
      fastify.log.error({ type: 'PRISMA_CONNECTION_ERROR', error }, 'Failed to connect to database');
      throw error;
    }
  });

  // Disconnect on server close
  fastify.addHook('onClose', async () => {
    await prisma.$disconnect();
    fastify.log.info({ type: 'PRISMA_DISCONNECTED' }, 'Prisma disconnected from database');
  });
};

export default fp(prismaPlugin, {
  name: 'prisma-plugin',
  fastify: '5.x',
});
