import { Router, Request, Response } from "express";
import { ZodError } from "zod";
import { CreateWebhookRequestSchema, UpdateWebhookRequestSchema } from "../schemas/webhooks";
import { PrismaWebhookRepository } from "../../database/repositories/PrismaWebhookRepository";
import { CreateWebhook, WebhookLimitExceededError } from "../../../application/useCases/CreateWebhook";
import { ListWebhooks } from "../../../application/useCases/ListWebhooks";
import { DeleteWebhook, WebhookNotFoundError, WebhookUnauthorizedError } from "../../../application/useCases/DeleteWebhook";
import { UpdateWebhook } from "../../../application/useCases/UpdateWebhook";
import { WebhookValidationError, WEBHOOK_EVENTS } from "../../../domain/entities/Webhook";
import { logger } from "../../logger";
import { ensureMerchantId } from "../utils/ensureMerchantId";
import { prisma } from "../../database/prismaClient";
import { authMiddleware } from "../middlewares/authMiddleware";

export const webhooksRouter = Router();

// Todas as rotas de Webhooks requerem autenticação
webhooksRouter.use(authMiddleware);

/**
 * @swagger
 * /webhooks/events:
 *   get:
 *     summary: Lista eventos disponíveis para webhooks
 *     tags: [Webhooks]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de eventos
 */
webhooksRouter.get("/events", async (_req: Request, res: Response) => {
  res.json({
    events: WEBHOOK_EVENTS,
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
 * @swagger
 * /webhooks:
 *   post:
 *     summary: Criar novo webhook
 *     tags: [Webhooks]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - url
 *               - events
 *             properties:
 *               name:
 *                 type: string
 *                 description: Nome identificador do webhook
 *               url:
 *                 type: string
 *                 format: uri
 *                 description: URL de destino (HTTPS obrigatório em produção)
 *               events:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Lista de eventos para escutar
 *               devMode:
 *                 type: boolean
 *                 description: Se true, apenas recebe eventos de teste
 *     responses:
 *       201:
 *         description: Webhook criado com sucesso
 *       400:
 *         description: Dados inválidos ou limite excedido
 *       401:
 *         description: Não autenticado
 */
webhooksRouter.post("/", async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({
        error: { code: "UNAUTHORIZED", message: "Usuário não autenticado" },
      });
    }

    const merchantId = await ensureMerchantId(req.user.id);
    const parsed = CreateWebhookRequestSchema.parse(req.body);

    const webhookRepository = new PrismaWebhookRepository(prisma);
    const useCase = new CreateWebhook(webhookRepository);

    const result = await useCase.execute({
      merchantId,
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
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: err.message },
      });
    }
    if (err instanceof WebhookLimitExceededError) {
      return res.status(400).json({
        error: { code: "LIMIT_EXCEEDED", message: err.message },
      });
    }
    logger.error({ err }, "Erro ao criar Webhook");
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Erro interno" } });
  }
});

/**
 * @swagger
 * /webhooks:
 *   get:
 *     summary: Listar webhooks do merchant
 *     tags: [Webhooks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: includeInactive
 *         schema:
 *           type: boolean
 *         description: Incluir webhooks inativos
 *     responses:
 *       200:
 *         description: Lista de webhooks
 *       401:
 *         description: Não autenticado
 */
webhooksRouter.get("/", async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({
        error: { code: "UNAUTHORIZED", message: "Usuário não autenticado" },
      });
    }

    const merchantId = await ensureMerchantId(req.user.id);
    const includeInactive = req.query.includeInactive === "true";

    const webhookRepository = new PrismaWebhookRepository(prisma);
    const useCase = new ListWebhooks(webhookRepository);

    const result = await useCase.execute({ merchantId, includeInactive });

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
    logger.error({ err }, "Erro ao listar Webhooks");
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Erro interno" } });
  }
});

/**
 * @swagger
 * /webhooks/{id}:
 *   put:
 *     summary: Atualizar um webhook
 *     tags: [Webhooks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID do webhook (interno ou público)
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               url:
 *                 type: string
 *                 format: uri
 *               events:
 *                 type: array
 *                 items:
 *                   type: string
 *               active:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Webhook atualizado
 *       400:
 *         description: Dados inválidos
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Não autorizado
 *       404:
 *         description: Webhook não encontrado
 */
webhooksRouter.put("/:id", async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({
        error: { code: "UNAUTHORIZED", message: "Usuário não autenticado" },
      });
    }

    const { id } = req.params;
    const merchantId = await ensureMerchantId(req.user.id);
    const parsed = UpdateWebhookRequestSchema.parse(req.body);

    const webhookRepository = new PrismaWebhookRepository(prisma);
    const useCase = new UpdateWebhook(webhookRepository);

    const result = await useCase.execute({
      webhookId: id,
      merchantId,
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
      return res.status(400).json({
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
    logger.error({ err }, "Erro ao atualizar Webhook");
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Erro interno" } });
  }
});

/**
 * @swagger
 * /webhooks/{id}:
 *   delete:
 *     summary: Deletar um webhook
 *     tags: [Webhooks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID do webhook (interno ou público)
 *     responses:
 *       204:
 *         description: Webhook deletado
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Não autorizado
 *       404:
 *         description: Webhook não encontrado
 */
webhooksRouter.delete("/:id", async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({
        error: { code: "UNAUTHORIZED", message: "Usuário não autenticado" },
      });
    }

    const { id } = req.params;
    const merchantId = await ensureMerchantId(req.user.id);

    const webhookRepository = new PrismaWebhookRepository(prisma);
    const useCase = new DeleteWebhook(webhookRepository);

    await useCase.execute({
      webhookId: id,
      merchantId,
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
    logger.error({ err }, "Erro ao deletar Webhook");
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Erro interno" } });
  }
});

