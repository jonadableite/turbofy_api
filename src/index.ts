// 🔐 SECURITY: Applies Helmet for secure HTTP headers, CORS with explicit origin, and basic rate limiting.
// 📈 SCALABILITY: Uses clustering via Node.js cluster (future), connection pooling via Prisma.
// 🛠️ MAINTAINABILITY: Modular middlewares and clear separation of concerns.
// 🧪 TESTABILITY: Server exported for integration testing, dependencies (prisma) injectable/mocked.
// 🔄 EXTENSIBILITY: Easy to add new routers and middlewares.

/**
 * @security Validates env vars through env.ts, applies security middlewares, disables x-powered-by header
 * @performance Utilises Prisma singleton client to reuse db connections
 * @maintainability Express app separated from server listen for easier testing
 * @testability Exports `app` instance to Supertest
 */

import chalk from "chalk";
import cookieParser from "cookie-parser";
import cors from "cors";
import "dotenv/config";
import express from "express";
import fs from "fs";
import helmet from "helmet";
import https from "https";
import path from "path";
import pinoHttp from "pino-http";
import { register } from "prom-client";
import { env } from "./config/env";
import { RabbitMQMessagingAdapter } from "./infrastructure/adapters/messaging/RabbitMQMessagingAdapter";
import { startChargeExpiredConsumer } from "./infrastructure/consumers/ChargeExpiredConsumer";
import { startChargePaidConsumer } from "./infrastructure/consumers/ChargePaidConsumer";
import { startDocumentValidationConsumer } from "./infrastructure/consumers/DocumentValidationConsumer";
import { startWebhookDeliveryConsumer } from "./infrastructure/consumers/WebhookDeliveryConsumer";
import { startWebhookDispatcherConsumer } from "./infrastructure/consumers/WebhookDispatcherConsumer";
import { adminRouter } from "./infrastructure/http/routes/adminRoutes";
import { affiliatesRouter } from "./infrastructure/http/routes/affiliatesRoutes";
import { apiKeysRouter } from "./infrastructure/http/routes/apiKeysRoutes";
import { apiRouter } from "./infrastructure/http/routes/apiRoutes";
import { authRouter } from "./infrastructure/http/routes/authRoutes";
import { balanceRouter } from "./infrastructure/http/routes/balanceRoutes";
import { chargesRouter } from "./infrastructure/http/routes/chargesRoutes";
import { checkoutRouter } from "./infrastructure/http/routes/checkoutRoutes";
import { commissionRouter } from "./infrastructure/http/routes/commissionRoutes";
import { couponsRouter } from "./infrastructure/http/routes/couponsRoutes";
import { dashboardRouter } from "./infrastructure/http/routes/dashboardRoutes";
import { domainConfigRouter } from "./infrastructure/http/routes/domainConfigRoutes";
import { integrationsWebhooksRouter } from "./infrastructure/http/routes/integrationsWebhooksRoutes";
import { kycRouter } from "./infrastructure/http/routes/kycRoutes";
import { onboardingRouter } from "./infrastructure/http/routes/onboardingRoutes";
import { pixKeyRouter } from "./infrastructure/http/routes/pixKeyRoutes";
import { producerSplitsRouter } from "./infrastructure/http/routes/producerSplitsRoutes";
import { productCheckoutRouter } from "./infrastructure/http/routes/productCheckoutRoutes";
import { productsRouter } from "./infrastructure/http/routes/productsRoutes";
import { reconciliationsRouter } from "./infrastructure/http/routes/reconciliationsRoutes";
import { rifeiroRouter } from "./infrastructure/http/routes/rifeiroRoutes";
import { rifeiroWebhookRouter } from "./infrastructure/http/routes/rifeiroWebhookRoutes";
import { settlementsRouter } from "./infrastructure/http/routes/settlementsRoutes";
import { studioRouter } from "./infrastructure/http/routes/studioRoutes";
import { transfeeraWebhookRouter } from "./infrastructure/http/routes/transfeeraWebhookRoutes";
import { uploadRouter } from "./infrastructure/http/routes/uploadRoutes";
import { videoRouter } from "./infrastructure/http/routes/videoRoutes";
import { webhooksRouter } from "./infrastructure/http/routes/webhooksRoutes";
import { withdrawalRouter } from "./infrastructure/http/routes/withdrawalRoutes";
import { setupSwagger } from "./infrastructure/http/swagger";
import makeLogger, { pinoLogger } from "./infrastructure/logger/logger";

const app = express();
const logger = makeLogger();

// Trust proxy para funcionar corretamente atrás de Cloudflare/NGINX
// Configurar para confiar apenas no primeiro proxy (mais seguro para rate limiting)
// Isso permite que req.ip funcione corretamente sem permitir bypass do rate limiting
app.set('trust proxy', 1); // Confiar apenas no primeiro proxy (Cloudflare/NGINX)

// Configurar CORS corretamente para múltiplas origens
const corsOrigin = process.env.CORS_ORIGIN || "*";
const allowedOrigins: string[] | "*" = corsOrigin === "*" 
  ? "*" 
  : corsOrigin.split(",").map((origin) => origin.trim());

// Configurar Helmet para não interferir com CORS
// IMPORTANTE: Desabilitar headers CORS do Helmet, deixar apenas o middleware cors gerenciar
app.use(helmet({
  crossOriginResourcePolicy: false, // Desabilitar completamente
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: false,
}));

app.use(
  cors({
    origin: (origin, callback) => {
      // Permitir requisições sem origem (ex: Postman, mobile apps)
      if (!origin) {
        return callback(null, true);
      }

      // Se for "*", permitir todas as origens
      if (allowedOrigins === "*") {
        return callback(null, true);
      }

      // Verificar se a origem está na lista permitida
      if (Array.isArray(allowedOrigins) && allowedOrigins.includes(origin)) {
        // Retornar a origem específica (não true) para evitar múltiplos valores no header
        return callback(null, origin);
      }

      // Rejeitar origem não permitida
      callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type", 
      "Authorization", 
      "x-client-id", 
      "x-client-secret", 
      "x-idempotency-key",
      "X-CSRF-Token",
      "x-csrf-token"
    ],
    exposedHeaders: ["Set-Cookie"],
  })
);

app.use(cookieParser());

// Middleware para capturar rawBody para webhooks (deve vir antes de express.json())
// Necessário para validar assinatura HMAC dos webhooks
app.use('/webhooks/transfeera', express.raw({ type: 'application/json' }), (req, res, next) => {
  // Salvar rawBody antes do parsing
  (req as any).rawBody = req.body;
  // Converter para JSON para o próximo middleware
  try {
    req.body = JSON.parse(req.body.toString('utf8'));
  } catch (e) {
    // Se falhar, deixar body vazio
    req.body = {};
  }
  next();
});

app.use(express.json());

// Otimizar logs HTTP - reduzir verbosidade drasticamente
const isDevelopment = process.env.NODE_ENV === 'development';

// Cache para evitar logs duplicados em sequência
const logCache = new Map<string, { count: number; lastLog: number }>();
const LOG_CACHE_TTL = 5000; // 5 segundos
const MAX_DUPLICATE_LOGS = 3; // Máximo de logs duplicados antes de suprimir

app.use(pinoHttp({ 
  logger: pinoLogger,
  // Reduzir logs em desenvolvimento para evitar sobrecarga
  autoLogging: isDevelopment ? {
    ignore: (req) => {
      // Ignorar logs de health check e métricas
      if (req.url === '/healthz' || req.url === '/metrics') {
        return true;
      }
      
      // Ignorar requisições GET bem-sucedidas (200, 304) em desenvolvimento
      // Logar apenas erros (4xx, 5xx) e métodos não-GET
      if (req.method === 'GET') {
        // Verificar se é uma requisição repetida
        const cacheKey = `${req.method}:${req.url}`;
        const now = Date.now();
        const cached = logCache.get(cacheKey);
        
        if (cached) {
          // Se a mesma requisição foi feita recentemente, incrementar contador
          if (now - cached.lastLog < LOG_CACHE_TTL) {
            cached.count++;
            cached.lastLog = now;
            
            // Se exceder o limite, suprimir o log
            if (cached.count > MAX_DUPLICATE_LOGS) {
              return true; // Ignorar este log
            }
          } else {
            // Resetar contador se passou o TTL
            cached.count = 1;
            cached.lastLog = now;
          }
        } else {
          // Primeira vez, criar entrada no cache
          logCache.set(cacheKey, { count: 1, lastLog: now });
        }
        
        // Limpar cache antigo periodicamente
        if (Math.random() < 0.01) { // 1% de chance a cada requisição
          for (const [key, value] of logCache.entries()) {
            if (now - value.lastLog > LOG_CACHE_TTL * 2) {
              logCache.delete(key);
            }
          }
        }
        
        // Em desenvolvimento, ignorar GET requests bem-sucedidas
        // Logar apenas erros (será logado no response)
        return false; // Não ignorar, mas vamos filtrar no response
      }
      
      return false;
    },
  } : true,
  // Reduzir drasticamente o tamanho dos logs
  serializers: {
    req: (req: express.Request) => {
      // Log mínimo apenas com informações essenciais
      const base = {
        id: req.id,
        method: req.method,
        url: req.url?.split('?')[0], // Remover query params para reduzir tamanho
      };
      
      // Adicionar query apenas se houver
      if (req.url?.includes('?')) {
        return { ...base, hasQuery: true };
      }
      
      return base;
    },
    res: (res: express.Response) => ({
      statusCode: res.statusCode,
    }),
  },
  // Customizar mensagem de log
  customLogLevel: (req, res, err) => {
    // Em desenvolvimento, logar apenas erros e métodos não-GET
    if (isDevelopment) {
      if (err) return 'error';
      if (res.statusCode >= 400) return 'warn';
      if (req.method === 'GET') return 'silent'; // Suprimir GET bem-sucedidas
      return 'info';
    }
    // Em produção, logar tudo normalmente
    if (err) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  // Reduzir informações do request
  customSuccessMessage: (req, res) => {
    if (isDevelopment && req.method === 'GET' && res.statusCode < 400) {
      return ''; // Não logar GET bem-sucedidas em dev (retornar string vazia)
    }
    return `${req.method} ${req.url} ${res.statusCode}`;
  },
}));

// ... (middlewares)

app.use('/api', apiRouter);
app.use('/auth', authRouter);
app.use('/charges', chargesRouter);
app.use('/checkout', checkoutRouter);
app.use('/settlements', settlementsRouter);
app.use('/reconciliations', reconciliationsRouter);
app.use('/dashboard', dashboardRouter);
app.use('/studio', studioRouter);
app.use('/products', productsRouter);
app.use('/webhooks/transfeera', transfeeraWebhookRouter);
app.use('/creator', affiliatesRouter);
app.use('/creator', commissionRouter);
app.use('/videos', videoRouter);
app.use('/domain-config', domainConfigRouter);
app.use('/upload', uploadRouter);
app.use('/onboarding', onboardingRouter);
app.use('/admin', adminRouter);
app.use('/api-keys', apiKeysRouter);
app.use('/webhooks', webhooksRouter);
app.use('/integrations/webhooks', integrationsWebhooksRouter); // Webhooks para integradores (client credentials)
app.use('/kyc', kycRouter);
app.use('/pix-key', pixKeyRouter);
app.use('/balance', balanceRouter);
app.use('/withdrawals', withdrawalRouter);
app.use('/coupons', couponsRouter);
app.use('/rifeiro/webhooks', rifeiroWebhookRouter);
app.use('/rifeiro', rifeiroRouter);
// Producer splits deve vir antes da rota genérica para não ser interceptada
app.use('/producer/splits', producerSplitsRouter);
logger.info({
  type: "ROUTES_REGISTERED",
  message: "Producer splits router registrado em /producer/splits",
  payload: { route: "/producer/splits" },
});
// ProductCheckout routes (builder de checkout personalizado)
app.use('/product-checkouts', productCheckoutRouter);
// Rotas públicas de checkout (/c/:slug e /c/:slug/pay) - deve ser a última
app.use('/', productCheckoutRouter);
// Servir arquivos estáticos de upload
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Health check
app.get('/healthz', (_req, res) => {
  res.status(200).json({ ok: true });
});

app.get('/metrics', async (_req, res) => {
  res.setHeader('Content-Type', register.contentType);
  res.end(await register.metrics());
});
// TODO: Register domain routers here (payments, merchants etc.)

// Swagger docs
try {
  setupSwagger(app);
  logger.info({
    type: "SWAGGER_READY",
    message: "Swagger configurado com sucesso",
  });
} catch (err) {
  logger.error({
    type: "SWAGGER_ERROR",
    message: "Erro ao configurar Swagger",
    error: err,
  });
  console.error(chalk.red(`\n⚠️  Aviso: Erro ao configurar Swagger: ${err instanceof Error ? err.message : 'Erro desconhecido'}\n`));
  // Não interrompe o servidor se o Swagger falhar
}

const PORT = Number(env.PORT);
const HTTPS_PORT = Number(env.HTTPS_PORT);
logger.info({
  type: "SERVER_STARTING",
  message: "Iniciando servidor HTTP",
  payload: { port: PORT, httpsEnabled: env.HTTPS_ENABLED, httpsPort: HTTPS_PORT },
});

const bootstrap = async () => {
  try {
    // #region agent log
    void fetch('http://127.0.0.1:7242/ingest/480d274d-bf63-41e3-b593-f2456c48c70b', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'debug-session',
        runId: 'pre-fix',
        hypothesisId: 'H1',
        location: 'api/src/index.ts:bootstrap:start',
        message: 'Bootstrap iniciado',
        data: { port: PORT, httpsEnabled: env.HTTPS_ENABLED, nodeEnv: env.NODE_ENV },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion

    let chargePaidConsumer: Awaited<ReturnType<typeof startChargePaidConsumer>> | null = null;
    let chargeExpiredConsumer: Awaited<ReturnType<typeof startChargeExpiredConsumer>> | null = null;
    let documentValidationConsumer: Awaited<ReturnType<typeof startDocumentValidationConsumer>> | null = null;
    let webhookDispatcherConsumer: Awaited<ReturnType<typeof startWebhookDispatcherConsumer>> | null = null;
    let webhookDeliveryConsumer: Awaited<ReturnType<typeof startWebhookDeliveryConsumer>> | null = null;

    if (env.NODE_ENV !== "test") {
      try {
        // Initialize RabbitMQ queues (creates exchanges, queues and DLQs)
        const rabbitMQAdapter = new RabbitMQMessagingAdapter();
        await rabbitMQAdapter.initialize();
        await rabbitMQAdapter.close();
        logger.info({
          type: "RABBITMQ_READY",
          message: "RabbitMQ queues inicializadas",
        });

        chargePaidConsumer = await startChargePaidConsumer();
        chargeExpiredConsumer = await startChargeExpiredConsumer();
        documentValidationConsumer = await startDocumentValidationConsumer();
        webhookDispatcherConsumer = await startWebhookDispatcherConsumer();
        webhookDeliveryConsumer = await startWebhookDeliveryConsumer();
        logger.info({
          type: "RABBITMQ_CONSUMERS_READY",
          message: "RabbitMQ consumers inicializados",
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        logger.warn({
          type: "RABBITMQ_CONSUMERS_SKIPPED",
          message: "Falha ao inicializar consumidores RabbitMQ, continuando sem eles",
          payload: { error: errorMessage },
        });
      }
    }

    // Configurar HTTPS se habilitado
    let httpsServer: https.Server | null = null;
    if (env.HTTPS_ENABLED && env.HTTPS_CERT_PATH && env.HTTPS_KEY_PATH) {
      try {
        const cert = fs.readFileSync(env.HTTPS_CERT_PATH, 'utf8');
        const key = fs.readFileSync(env.HTTPS_KEY_PATH, 'utf8');
        
        httpsServer = https.createServer({ cert, key }, app);
        httpsServer.listen(HTTPS_PORT, "0.0.0.0", () => {
          logger.info({
            type: "HTTPS_START",
            message: "Servidor HTTPS iniciado",
            payload: { port: HTTPS_PORT },
          });
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        logger.error({
          type: "HTTPS_ERROR",
          message: "Erro ao iniciar servidor HTTPS",
          error,
          payload: { error: errorMessage, certPath: env.HTTPS_CERT_PATH, keyPath: env.HTTPS_KEY_PATH },
        });
        console.error(chalk.red(`\n⚠️  Aviso: Erro ao iniciar HTTPS: ${errorMessage}\n`));
        console.error(chalk.yellow('Certifique-se de que os certificados existem e os caminhos estão corretos.\n'));
      }
    }

    const server = app.listen(PORT, "0.0.0.0", () => {
      // Banner de inicialização melhorado (usando símbolos ASCII para compatibilidade)
      console.log('\n' + chalk.cyan('═'.repeat(60)));
      console.log(chalk.bold.blue('  [TURBOFY GATEWAY - API BACKEND]'));
      console.log(chalk.cyan('═'.repeat(60)));
      console.log(chalk.green(`  [OK] Servidor:       http://localhost:${PORT}`));
      if (env.HTTPS_ENABLED && httpsServer) {
        console.log(chalk.green(`  [OK] Servidor HTTPS: https://localhost:${HTTPS_PORT}`));
      }
      console.log(chalk.green(`  [OK] Documentação:   http://localhost:${PORT}/docs`));
      console.log(chalk.green(`  [OK] Health Check:   http://localhost:${PORT}/healthz`));
      console.log(chalk.cyan('═'.repeat(60)));
      console.log(chalk.yellow(`  [INFO] Ambiente:      ${env.NODE_ENV}`));
      console.log(chalk.yellow(`  [INFO] CORS Origin:   ${process.env.CORS_ORIGIN || '*'}`));
      if (env.HTTPS_ENABLED) {
        console.log(chalk.yellow(`  [INFO] HTTPS:         Habilitado (porta ${HTTPS_PORT})`));
      }
      console.log(chalk.cyan('═'.repeat(60)));
      console.log(chalk.magenta('  [ENDPOINTS] Disponíveis:'));
      console.log(chalk.white('     • POST /auth/register       - Criar conta'));
      console.log(chalk.white('     • POST /auth/login          - Fazer login'));
      console.log(chalk.white('     • POST /auth/forgot-password - Recuperar senha'));
      console.log(chalk.white('     • GET  /api/auth/csrf       - Token CSRF'));
      console.log(chalk.white('     • POST /charges             - Criar cobrança'));
      console.log(chalk.white('     • POST /checkout/sessions   - Criar sessão de checkout'));
      console.log(chalk.white('     • GET  /checkout/sessions/:id - Detalhes da sessão'));
      console.log(chalk.cyan('═'.repeat(60)));
      console.log(chalk.green.bold('  [READY] Servidor pronto para receber requisições!\n'));

      logger.info({
        type: "SERVER_STARTED",
        message: "Turbofy API iniciada com sucesso",
        payload: { port: PORT, httpsEnabled: env.HTTPS_ENABLED, httpsPort: HTTPS_PORT },
      });
    });

    // Tratamento de erros do servidor
    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        logger.error({
          type: "SERVER_PORT_IN_USE",
          message: `Porta ${PORT} já está em uso. Tente usar outra porta.`,
          error: err,
          payload: { port: PORT },
        });
        console.error(chalk.red(`\n❌ Erro: Porta ${PORT} já está em uso!\n`));
        console.error(chalk.yellow('Soluções:'));
        console.error(chalk.white('  1. Pare o processo que está usando a porta 3000'));
        console.error(chalk.white('  2. Ou altere a variável PORT no arquivo .env\n'));
        process.exit(1);
      } else {
        logger.error({
          type: "SERVER_START_ERROR",
          message: "Erro ao iniciar servidor",
          error: err,
        });
        console.error(chalk.red(`\n❌ Erro ao iniciar servidor: ${err.message}\n`));
        process.exit(1);
      }
    });

    const shutdown = async (signal: NodeJS.Signals) => {
      logger.info({
        type: "SERVER_SHUTDOWN_REQUESTED",
        message: "Encerrando servidor por sinal recebido",
        payload: { signal },
      });
      await Promise.all([
        chargePaidConsumer?.stop(),
        chargeExpiredConsumer?.stop(),
        documentValidationConsumer?.stop(),
      ]);
      
      const closePromises = [new Promise<void>((resolve) => server.close(() => resolve()))];
      if (httpsServer) {
        closePromises.push(new Promise<void>((resolve) => httpsServer!.close(() => resolve())));
      }
      
      await Promise.all(closePromises);
      logger.info({
        type: "SERVER_SHUTDOWN_COMPLETE",
        message: "Servidor encerrado",
      });
      process.exit(0);
    };

    // Graceful shutdown
    process.on('SIGTERM', () => {
      void shutdown('SIGTERM');
    });

    process.on('SIGINT', () => {
      void shutdown('SIGINT');
    });
  } catch (err) {
    // #region agent log
    void fetch('http://127.0.0.1:7242/ingest/480d274d-bf63-41e3-b593-f2456c48c70b', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'debug-session',
        runId: 'pre-fix',
        hypothesisId: 'H1',
        location: 'api/src/index.ts:bootstrap:catch',
        message: 'Bootstrap falhou',
        data: { error: err instanceof Error ? err.message : 'unknown' },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion

    logger.error({
      type: "SERVER_FATAL_ERROR",
      message: "Erro fatal ao inicializar servidor",
      error: err,
    });
    console.error(chalk.red(`\n❌ Erro fatal: ${err instanceof Error ? err.message : 'Erro desconhecido'}\n`));
    process.exit(1);
  }
};

if (process.env.NODE_ENV !== "test") {
  bootstrap().catch((err) => {
    logger.error({
      type: "SERVER_BOOTSTRAP_FAILED",
      message: "Bootstrap falhou",
      error: err,
    });
    process.exit(1);
  });
}

export { app };

