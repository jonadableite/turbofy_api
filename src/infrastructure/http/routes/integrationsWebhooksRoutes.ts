/**
 * Rotas de Webhooks para Integradores
 * 
 * Namespace neutro: /integrations/webhooks
 * Autenticação: Client Credentials (x-client-id / x-client-secret)
 * 
 * @security Client credentials, validação anti-SSRF, rate limiting
 * @scalability Webhooks assíncronos via RabbitMQ
 */

import { Response, Router } from "express";
import { ZodError } from "zod";
import { CreateWebhook, WebhookLimitExceededError } from "../../../application/useCases/CreateWebhook";
import { DeleteWebhook, WebhookNotFoundError, WebhookUnauthorizedError } from "../../../application/useCases/DeleteWebhook";
import { DispatchWebhooks } from "../../../application/useCases/DispatchWebhooks";
import { ListWebhooks } from "../../../application/useCases/ListWebhooks";
import { RotateWebhookSecret } from "../../../application/useCases/RotateWebhookSecret";
import { TestWebhook } from "../../../application/useCases/TestWebhook";
import { UpdateWebhook } from "../../../application/useCases/UpdateWebhook";
import { WEBHOOK_EVENTS, WebhookValidationError } from "../../../domain/entities/Webhook";
import { UrlValidationError, UrlValidator } from "../../../domain/validators/UrlValidator";
import { MessagingFactory } from "../../adapters/messaging/MessagingFactory";
import { prisma } from "../../database/prismaClient";
import { PrismaWebhookRepository } from "../../database/repositories/PrismaWebhookRepository";
import { logger } from "../../logger";
import {
  clientCredentialsMiddleware,
  ClientCredentialsRequest,
} from "../middlewares/clientCredentialsMiddleware";
import { CreateWebhookRequestSchema, UpdateWebhookRequestSchema } from "../schemas/webhooks";

export const integrationsWebhooksRouter = Router();

// Aplicar middleware de client credentials em todas as rotas
integrationsWebhooksRouter.use(clientCredentialsMiddleware);

/**
 * GET /integrations/webhooks/events
 * Lista eventos disponíveis para webhooks
 */
integrationsWebhooksRouter.get("/events", async (_req: ClientCredentialsRequest, res: Response) => {
  res.json({
    events: WEBHOOK_EVENTS.filter((evt) => evt !== "webhook.test"), // Não expor evento interno
    descriptions: {
      "billing.paid": "Pagamento confirmado",
      "billing.created": "Cobrança criada",
      "billing.expired": "Cobrança expirada",
      "billing.refunded": "Pagamento reembolsado",
      "withdraw.done": "Saque concluído",
      "withdraw.failed": "Saque falhou",
      "enrollment.created": "Matrícula criada",
      "charge.created": "Cobrança criada",
      "charge.paid": "Cobrança paga",
      "charge.expired": "Cobrança expirada",
    },
  });
});

/**
 * POST /integrations/webhooks
 * Criar novo webhook
 */
integrationsWebhooksRouter.post("/", async (req: ClientCredentialsRequest, res: Response) => {
  try {
    if (!req.merchantId) {
      return res.status(401).json({
        error: { code: "UNAUTHORIZED", message: "Merchant não identificado" },
      });
    }

    const parsed = CreateWebhookRequestSchema.parse(req.body);

    // Validar URL com proteção anti-SSRF
    const devMode = process.env.NODE_ENV !== "production";
    try {
      await UrlValidator.validate(parsed.url, parsed.devMode ?? devMode);
    } catch (err) {
      if (err instanceof UrlValidationError) {
        return res.status(422).json({
          error: {
            code: "VALIDATION_ERROR",
            message: err.message,
          },
        });
      }
      throw err;
    }

    const webhookRepository = new PrismaWebhookRepository(prisma);
    const useCase = new CreateWebhook(webhookRepository);

    const result = await useCase.execute({
      merchantId: req.merchantId,
      name: parsed.name,
      url: parsed.url,
      events: parsed.events,
      devMode: parsed.devMode,
    });

    res.status(201).json({
      id: result.id,
      publicId: result.publicId,
      name: result.name,
      url: result.url,
      secret: result.secret, // Retornado apenas na criação
      events: result.events,
      status: result.status,
      devMode: result.devMode,
      createdAt: result.createdAt.toISOString(),
    });
  } catch (err) {
    if (err instanceof ZodError) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: err.message, details: err.flatten() },
      });
    }
    if (err instanceof WebhookValidationError) {
      return res.status(422).json({
        error: { code: "VALIDATION_ERROR", message: err.message },
      });
    }
    if (err instanceof WebhookLimitExceededError) {
      return res.status(409).json({
        error: { code: "LIMIT_EXCEEDED", message: err.message },
      });
    }
    logger.error({ err }, "Erro ao criar Webhook (integrations)");
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Erro interno" } });
  }
});

/**
 * GET /integrations/webhooks
 * Listar webhooks do merchant autenticado
 */
integrationsWebhooksRouter.get("/", async (req: ClientCredentialsRequest, res: Response) => {
  try {
    if (!req.merchantId) {
      return res.status(401).json({
        error: { code: "UNAUTHORIZED", message: "Merchant não identificado" },
      });
    }

    const includeInactive = req.query.includeInactive === "true";

    const webhookRepository = new PrismaWebhookRepository(prisma);
    const useCase = new ListWebhooks(webhookRepository);

    const result = await useCase.execute({
      merchantId: req.merchantId,
      includeInactive,
    });

    res.json({
      webhooks: result.webhooks.map((wh) => ({
        id: wh.id,
        publicId: wh.publicId,
        name: wh.name,
        url: wh.url,
        events: wh.events,
        status: wh.status,
        failureCount: wh.failureCount,
        lastCalledAt: wh.lastCalledAt?.toISOString() ?? null,
        lastSuccess: wh.lastSuccess?.toISOString() ?? null,
        lastFailure: wh.lastFailure?.toISOString() ?? null,
        lastError: wh.lastError,
        devMode: wh.devMode,
        createdAt: wh.createdAt.toISOString(),
        updatedAt: wh.updatedAt.toISOString(),
      })),
      total: result.total,
    });
  } catch (err) {
    logger.error({ err }, "Erro ao listar Webhooks (integrations)");
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Erro interno" } });
  }
});

/**
 * GET /integrations/webhooks/:id
 * Obter webhook específico
 */
integrationsWebhooksRouter.get("/:id", async (req: ClientCredentialsRequest, res: Response) => {
  try {
    if (!req.merchantId) {
      return res.status(401).json({
        error: { code: "UNAUTHORIZED", message: "Merchant não identificado" },
      });
    }

    const { id } = req.params;
    const webhookRepository = new PrismaWebhookRepository(prisma);

    // Buscar por ID interno ou publicId
    let webhook = await webhookRepository.findById(id);
    if (!webhook) {
      webhook = await webhookRepository.findByPublicId(id);
    }

    if (!webhook) {
      return res.status(404).json({
        error: { code: "NOT_FOUND", message: "Webhook não encontrado" },
      });
    }

    // Validar ownership
    if (webhook.merchantId !== req.merchantId) {
      return res.status(403).json({
        error: { code: "FORBIDDEN", message: "Não autorizado a acessar este webhook" },
      });
    }

    res.json({
      id: webhook.id,
      publicId: webhook.publicId,
      name: webhook.name,
      url: webhook.url,
      events: webhook.events,
      status: webhook.status,
      failureCount: webhook.failureCount,
      lastCalledAt: webhook.lastCalledAt?.toISOString() ?? null,
      lastSuccess: webhook.lastSuccess?.toISOString() ?? null,
      lastFailure: webhook.lastFailure?.toISOString() ?? null,
      lastError: webhook.lastError,
      devMode: webhook.devMode,
      createdAt: webhook.createdAt.toISOString(),
      updatedAt: webhook.updatedAt.toISOString(),
    });
  } catch (err) {
    logger.error({ err }, "Erro ao obter Webhook (integrations)");
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Erro interno" } });
  }
});

/**
 * PUT /integrations/webhooks/:id
 * Atualizar webhook
 */
integrationsWebhooksRouter.put("/:id", async (req: ClientCredentialsRequest, res: Response) => {
  try {
    if (!req.merchantId) {
      return res.status(401).json({
        error: { code: "UNAUTHORIZED", message: "Merchant não identificado" },
      });
    }

    const { id } = req.params;
    const parsed = UpdateWebhookRequestSchema.parse(req.body);

    // Validar URL se fornecida
    if (parsed.url) {
      const devMode = process.env.NODE_ENV !== "production";
      try {
        await UrlValidator.validate(parsed.url, devMode);
      } catch (err) {
        if (err instanceof UrlValidationError) {
          return res.status(422).json({
            error: { code: "VALIDATION_ERROR", message: err.message },
          });
        }
        throw err;
      }
    }

    const webhookRepository = new PrismaWebhookRepository(prisma);
    const useCase = new UpdateWebhook(webhookRepository);

    const result = await useCase.execute({
      webhookId: id,
      merchantId: req.merchantId,
      name: parsed.name,
      url: parsed.url,
      events: parsed.events,
      active: parsed.active,
    });

    res.json({
      id: result.id,
      publicId: result.publicId,
      name: result.name,
      url: result.url,
      events: result.events,
      status: result.status,
      devMode: result.devMode,
      updatedAt: result.updatedAt.toISOString(),
    });
  } catch (err) {
    if (err instanceof ZodError) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: err.message, details: err.flatten() },
      });
    }
    if (err instanceof WebhookValidationError) {
      return res.status(422).json({
        error: { code: "VALIDATION_ERROR", message: err.message },
      });
    }
    if (err instanceof WebhookNotFoundError) {
      return res.status(404).json({
        error: { code: "NOT_FOUND", message: err.message },
      });
    }
    if (err instanceof WebhookUnauthorizedError) {
      return res.status(403).json({
        error: { code: "FORBIDDEN", message: err.message },
      });
    }
    logger.error({ err }, "Erro ao atualizar Webhook (integrations)");
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Erro interno" } });
  }
});

/**
 * DELETE /integrations/webhooks/:id
 * Deletar webhook
 */
integrationsWebhooksRouter.delete("/:id", async (req: ClientCredentialsRequest, res: Response) => {
  try {
    if (!req.merchantId) {
      return res.status(401).json({
        error: { code: "UNAUTHORIZED", message: "Merchant não identificado" },
      });
    }

    const { id } = req.params;

    const webhookRepository = new PrismaWebhookRepository(prisma);
    const useCase = new DeleteWebhook(webhookRepository);

    await useCase.execute({
      webhookId: id,
      merchantId: req.merchantId,
    });

    res.status(204).send();
  } catch (err) {
    if (err instanceof WebhookNotFoundError) {
      return res.status(404).json({
        error: { code: "NOT_FOUND", message: err.message },
      });
    }
    if (err instanceof WebhookUnauthorizedError) {
      return res.status(403).json({
        error: { code: "FORBIDDEN", message: err.message },
      });
    }
    logger.error({ err }, "Erro ao deletar Webhook (integrations)");
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Erro interno" } });
  }
});

/**
 * POST /integrations/webhooks/:id/test
 * Enviar evento de teste
 */
integrationsWebhooksRouter.post("/:id/test", async (req: ClientCredentialsRequest, res: Response) => {
  try {
    if (!req.merchantId) {
      return res.status(401).json({
        error: { code: "UNAUTHORIZED", message: "Merchant não identificado" },
      });
    }

    const { id } = req.params;

    const webhookRepository = new PrismaWebhookRepository(prisma);
    const messaging = MessagingFactory.create();
    const dispatchWebhooks = new DispatchWebhooks(messaging);

    const useCase = new TestWebhook(webhookRepository, dispatchWebhooks);

    const result = await useCase.execute({
      webhookId: id,
      merchantId: req.merchantId,
    });

    res.json({
      eventId: result.eventId,
      sent: result.sent,
      message: result.message,
    });
  } catch (err) {
    if (err instanceof WebhookNotFoundError) {
      return res.status(404).json({
        error: { code: "NOT_FOUND", message: err.message },
      });
    }
    if (err instanceof WebhookUnauthorizedError) {
      return res.status(403).json({
        error: { code: "FORBIDDEN", message: err.message },
      });
    }
    logger.error({ err }, "Erro ao testar Webhook (integrations)");
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Erro interno" } });
  }
});

/**
 * POST /integrations/webhooks/:id/rotate-secret
 * Rotacionar secret do webhook
 */
integrationsWebhooksRouter.post("/:id/rotate-secret", async (req: ClientCredentialsRequest, res: Response) => {
  try {
    if (!req.merchantId) {
      return res.status(401).json({
        error: { code: "UNAUTHORIZED", message: "Merchant não identificado" },
      });
    }

    const { id } = req.params;

    const webhookRepository = new PrismaWebhookRepository(prisma);
    const useCase = new RotateWebhookSecret(webhookRepository);

    const result = await useCase.execute({
      webhookId: id,
      merchantId: req.merchantId,
    });

    res.json({
      webhookId: result.webhookId,
      publicId: result.publicId,
      newSecret: result.newSecret,
      rotatedAt: result.rotatedAt,
      message: "Secret rotacionado com sucesso. Atualize sua aplicação com o novo secret antes que o anterior expire.",
    });
  } catch (err) {
    if (err instanceof WebhookNotFoundError) {
      return res.status(404).json({
        error: { code: "NOT_FOUND", message: err.message },
      });
    }
    if (err instanceof WebhookUnauthorizedError) {
      return res.status(403).json({
        error: { code: "FORBIDDEN", message: err.message },
      });
    }
    logger.error({ err }, "Erro ao rotacionar secret de Webhook (integrations)");
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Erro interno" } });
  }
});
