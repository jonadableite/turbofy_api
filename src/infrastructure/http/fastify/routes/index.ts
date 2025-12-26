/**
 * @file Routes Index
 * @description Central route registration for all Fastify routes
 * 
 * @maintainability All routes registered from single entry point
 * @extensibility Easy to add new route modules
 */

import { FastifyPluginAsync } from 'fastify';

const routes: FastifyPluginAsync = async (fastify) => {
  // Health check and metrics - No prefix, high priority
  await fastify.register(import('./health.routes'));

  // Authentication routes
  await fastify.register(import('./auth.routes'), { prefix: '/auth' });

  // Core business routes
  await fastify.register(import('./charges.routes'), { prefix: '/charges' });
  await fastify.register(import('./checkout.routes'), { prefix: '/checkout' });
  await fastify.register(import('./settlements.routes'), { prefix: '/settlements' });
  await fastify.register(import('./reconciliations.routes'), { prefix: '/reconciliations' });

  // Dashboard and analytics
  await fastify.register(import('./dashboard.routes'), { prefix: '/dashboard' });

  // Studio (Course/Product management)
  await fastify.register(import('./studio.routes'), { prefix: '/studio' });
  await fastify.register(import('./products.routes'), { prefix: '/products' });

  // Webhooks
  await fastify.register(import('./webhooks.routes'), { prefix: '/webhooks' });
  await fastify.register(import('./transfeera-webhook.routes'), { prefix: '/webhooks/transfeera' });

  // Affiliate and commission management
  await fastify.register(import('./affiliates.routes'), { prefix: '/creator' });
  await fastify.register(import('./commission.routes'), { prefix: '/creator' });

  // Configuration and settings
  await fastify.register(import('./domain-config.routes'), { prefix: '/domain-config' });
  await fastify.register(import('./api-keys.routes'), { prefix: '/api-keys' });

  // File management
  await fastify.register(import('./upload.routes'), { prefix: '/upload' });
  await fastify.register(import('./video.routes'), { prefix: '/videos' });

  // User management
  await fastify.register(import('./onboarding.routes'), { prefix: '/onboarding' });
  await fastify.register(import('./kyc.routes'), { prefix: '/kyc' });

  // Financial management
  await fastify.register(import('./balance.routes'), { prefix: '/balance' });
  await fastify.register(import('./withdrawal.routes'), { prefix: '/withdrawals' });
  await fastify.register(import('./pix-key.routes'), { prefix: '/pix-key' });
  await fastify.register(import('./coupons.routes'), { prefix: '/coupons' });

  // Rifeiro (Lottery) specific routes
  await fastify.register(import('./rifeiro.routes'), { prefix: '/rifeiro' });
  await fastify.register(import('./rifeiro-saques.routes'), { prefix: '/rifeiro/saques' });
  await fastify.register(import('./rifeiro-pix-key.routes'), { prefix: '/rifeiro/pix-key' });
  await fastify.register(import('./rifeiro-webhook.routes'), { prefix: '/rifeiro/webhooks' });

  // Producer management
  await fastify.register(import('./producer-splits.routes'), { prefix: '/producer/splits' });

  // Product checkout (custom checkout builder)
  await fastify.register(import('./product-checkout.routes'), { prefix: '/product-checkouts' });

  // Admin routes
  await fastify.register(import('./admin.routes'), { prefix: '/admin' });

  // API routes (legacy compatibility)
  await fastify.register(import('./api.routes'), { prefix: '/api' });

  // Integrations webhooks (for integrators with client credentials)
  await fastify.register(import('./integrations-webhooks.routes'), { prefix: '/integrations/webhooks' });

  // Public checkout routes (must be last due to catch-all pattern)
  await fastify.register(import('./public-checkout.routes'));

  fastify.log.info({ type: 'ROUTES_REGISTERED' }, 'All routes registered successfully');
};

export default routes;
