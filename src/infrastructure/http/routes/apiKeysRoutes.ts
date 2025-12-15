import { Router, Request, Response } from "express";
import { ZodError } from "zod";
import { CreateApiKeyRequestSchema } from "../schemas/apiKeys";
import { PrismaApiKeyRepository } from "../../database/repositories/PrismaApiKeyRepository";
import { CreateApiKey } from "../../../application/useCases/CreateApiKey";
import { ListApiKeys } from "../../../application/useCases/ListApiKeys";
import { 
  RevokeApiKey, 
  ApiKeyNotFoundError, 
  ApiKeyUnauthorizedError, 
  ApiKeyAlreadyRevokedError 
} from "../../../application/useCases/RevokeApiKey";
import { logger } from "../../logger";
import { ensureMerchantId } from "../utils/ensureMerchantId";
import { prisma } from "../../database/prismaClient";
import { authMiddleware } from "../middlewares/authMiddleware";

export const apiKeysRouter = Router();

// Todas as rotas de API Keys requerem autenticação
apiKeysRouter.use(authMiddleware);

/**
 * @swagger
 * /api-keys:
 *   post:
 *     summary: Criar nova chave de API
 *     tags: [API Keys]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: Nome/descrição da chave
 *               permissions:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Lista de permissões
 *               expiresAt:
 *                 type: string
 *                 format: date-time
 *                 description: Data de expiração (opcional)
 *     responses:
 *       201:
 *         description: Chave criada com sucesso
 *       400:
 *         description: Dados inválidos
 *       401:
 *         description: Não autenticado
 */
apiKeysRouter.post("/", async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ 
        error: { code: "UNAUTHORIZED", message: "Usuário não autenticado" } 
      });
    }

    const merchantId = await ensureMerchantId(req.user.id);
    const parsed = CreateApiKeyRequestSchema.parse(req.body);

    const apiKeyRepository = new PrismaApiKeyRepository(prisma);
    const useCase = new CreateApiKey(apiKeyRepository);

    const result = await useCase.execute({
      merchantId,
      name: parsed.name,
      origin: "DASHBOARD",
      permissions: parsed.permissions,
      expiresAt: parsed.expiresAt ? new Date(parsed.expiresAt) : undefined,
    });

    res.status(201).json({
      id: result.id,
      merchantId: result.merchantId,
      rawKey: result.rawKey,
      maskedKey: result.maskedKey,
      name: result.name,
      origin: result.origin,
      permissions: result.permissions,
      expiresAt: result.expiresAt?.toISOString() ?? null,
      createdAt: result.createdAt.toISOString(),
    });
  } catch (err) {
    if (err instanceof ZodError) {
      return res.status(400).json({ 
        error: { code: "VALIDATION_ERROR", message: err.message, details: err.flatten() } 
      });
    }
    logger.error({ err }, "Erro ao criar API Key");
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Erro interno" } });
  }
});

/**
 * @swagger
 * /api-keys:
 *   get:
 *     summary: Listar chaves de API do merchant
 *     tags: [API Keys]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: includeRevoked
 *         schema:
 *           type: boolean
 *         description: Incluir chaves revogadas
 *     responses:
 *       200:
 *         description: Lista de chaves
 *       401:
 *         description: Não autenticado
 */
apiKeysRouter.get("/", async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ 
        error: { code: "UNAUTHORIZED", message: "Usuário não autenticado" } 
      });
    }

    const merchantId = await ensureMerchantId(req.user.id);
    const includeRevoked = req.query.includeRevoked === "true";

    const apiKeyRepository = new PrismaApiKeyRepository(prisma);
    const useCase = new ListApiKeys(apiKeyRepository);

    const result = await useCase.execute({ merchantId, includeRevoked });

    res.json({
      apiKeys: result.apiKeys.map((key) => ({
        id: key.id,
        maskedKey: key.maskedKey,
        name: key.name,
        origin: key.origin,
        permissions: key.permissions,
        lastUsedAt: key.lastUsedAt?.toISOString() ?? null,
        expiresAt: key.expiresAt?.toISOString() ?? null,
        revokedAt: key.revokedAt?.toISOString() ?? null,
        createdAt: key.createdAt.toISOString(),
        isActive: key.isActive,
      })),
      total: result.total,
    });
  } catch (err) {
    logger.error({ err }, "Erro ao listar API Keys");
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Erro interno" } });
  }
});

/**
 * @swagger
 * /api-keys/{id}/revoke:
 *   post:
 *     summary: Revogar uma chave de API
 *     tags: [API Keys]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID da chave
 *     responses:
 *       200:
 *         description: Chave revogada com sucesso
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Não autorizado
 *       404:
 *         description: Chave não encontrada
 */
apiKeysRouter.post("/:id/revoke", async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ 
        error: { code: "UNAUTHORIZED", message: "Usuário não autenticado" } 
      });
    }

    const { id } = req.params;
    const merchantId = await ensureMerchantId(req.user.id);

    const apiKeyRepository = new PrismaApiKeyRepository(prisma);
    const useCase = new RevokeApiKey(apiKeyRepository);

    const result = await useCase.execute({
      apiKeyId: id,
      merchantId,
      userId: req.user.id,
    });

    res.json({
      id: result.id,
      revokedAt: result.revokedAt.toISOString(),
      success: result.success,
    });
  } catch (err) {
    if (err instanceof ApiKeyNotFoundError) {
      return res.status(404).json({ 
        error: { code: "NOT_FOUND", message: err.message } 
      });
    }
    if (err instanceof ApiKeyUnauthorizedError) {
      return res.status(403).json({ 
        error: { code: "FORBIDDEN", message: err.message } 
      });
    }
    if (err instanceof ApiKeyAlreadyRevokedError) {
      return res.status(400).json({ 
        error: { code: "ALREADY_REVOKED", message: err.message } 
      });
    }
    logger.error({ err }, "Erro ao revogar API Key");
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Erro interno" } });
  }
});

/**
 * @swagger
 * /api-keys/{id}:
 *   delete:
 *     summary: Deletar uma chave de API (apenas se revogada)
 *     tags: [API Keys]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID da chave
 *     responses:
 *       204:
 *         description: Chave deletada com sucesso
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Não autorizado ou chave não revogada
 *       404:
 *         description: Chave não encontrada
 */
apiKeysRouter.delete("/:id", async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ 
        error: { code: "UNAUTHORIZED", message: "Usuário não autenticado" } 
      });
    }

    const { id } = req.params;
    const merchantId = await ensureMerchantId(req.user.id);

    const apiKeyRepository = new PrismaApiKeyRepository(prisma);
    
    const apiKey = await apiKeyRepository.findById(id);
    
    if (!apiKey) {
      return res.status(404).json({ 
        error: { code: "NOT_FOUND", message: "API Key não encontrada" } 
      });
    }

    if (apiKey.merchantId !== merchantId) {
      return res.status(403).json({ 
        error: { code: "FORBIDDEN", message: "Não autorizado" } 
      });
    }

    if (!apiKey.isRevoked()) {
      return res.status(403).json({ 
        error: { code: "NOT_REVOKED", message: "Chave precisa ser revogada antes de ser deletada" } 
      });
    }

    await apiKeyRepository.delete(id);

    res.status(204).send();
  } catch (err) {
    logger.error({ err }, "Erro ao deletar API Key");
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Erro interno" } });
  }
});

