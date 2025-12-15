// 🔐 SECURITY: Centralizing Prisma client prevents leaking multiple DB connections and allows setting up safe connection options
// 📈 SCALABILITY: Re-uses a single PrismaClient instance to avoid exhausting database connections under load
// 🛠️ MAINTAINABILITY: Encapsulates Prisma initialization, easing future swap or config tweaks
// 🧪 TESTABILITY: Can be mocked in tests by jest.mock()
// 🔄 EXTENSIBILITY: Additional middlewares (e.g., logging, tracing) can be plugged here

/**
 * @security Uses environment variable validation (see env.ts) to retrieve DATABASE_URL securely
 * @performance Ensures a single global PrismaClient to leverage connection pooling
 * @maintainability Isolated in infrastructure layer respecting Hexagonal Architecture
 * @testability Exported instance can be stubbed during unit tests
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

// Prevent multiple instances in development with hot-reload
declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
  // eslint-disable-next-line no-var
  var pool: Pool | undefined;
}

// Initialize shared pg Pool
const pool = global.pool || new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Attach Prisma adapter for Postgres (Prisma 7 driver adapter)
const adapter = new PrismaPg(pool);

const prisma = global.prisma || new PrismaClient({
  adapter,
  log: ["error", "warn"],
});

if (process.env.NODE_ENV !== "production") {
  global.prisma = prisma;
  global.pool = pool;
}

export { prisma };
