/**
 * Producer Splits Routes
 * 
 * Endpoints para Producers gerenciarem splits com Rifeiros
 * - Buscar Rifeiro por CPF
 * - Associar Rifeiro com porcentagem (locked após confirmação)
 * - Listar associados
 */

import { Request, Response, Router } from "express";
import rateLimit from "express-rate-limit";
import { ZodError, z } from "zod";
import { LinkAssociate } from "../../../application/useCases/LinkAssociate";
import { SearchRifeiroByDocument } from "../../../application/useCases/SearchRifeiroByDocument";
import { prisma } from "../../database/prismaClient";
import { logger } from "../../logger";
import { authMiddleware } from "../middlewares/authMiddleware";
import { ensureMerchantId } from "../utils/ensureMerchantId";

export const producerSplitsRouter = Router();

// Debug middleware para verificar rotas
producerSplitsRouter.use((req, res, next) => {
  logger.info({ 
    method: req.method, 
    path: req.path, 
    url: req.url, 
    originalUrl: req.originalUrl,
    baseUrl: req.baseUrl 
  }, "Producer splits router - requisição recebida");
  next();
});

producerSplitsRouter.use(authMiddleware);

// Rate limiting para evitar requisições excessivas
const associadosLimiter = rateLimit({
  windowMs: 10 * 1000, // 10 segundos
  max: 5, // Máximo 5 requisições por 10 segundos
  message: {
    error: {
      code: "TOO_MANY_REQUESTS",
      message: "Muitas requisições. Aguarde alguns segundos antes de tentar novamente.",
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Em desenvolvimento, ser mais permissivo
    return process.env.NODE_ENV === 'development';
  },
});

const searchSchema = z.object({
  document: z.string().min(11).max(18),
});

const linkRifeiroSchema = z.object({
  document: z.string().min(11).max(18),
  splitPercentage: z.number().min(0.01).max(100),
  confirm: z.boolean().default(false), // Se true, marca como locked
  // Campos opcionais para criar associado quando não houver rifeiro encontrado
  name: z.string().min(3).optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
});

/**
 * GET /producer/splits/rifeiro/search?document=XXX
 * Busca um Rifeiro pelo CPF/CNPJ
 */
producerSplitsRouter.get("/rifeiro/search", async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({
        error: { code: "UNAUTHORIZED", message: "Usuário não autenticado" },
      });
    }

    const merchantId = await ensureMerchantId(req.user.id);

    // Verificar se o merchant é PRODUCER ou RIFEIRO
    const merchant = await prisma.merchant.findUnique({
      where: { id: merchantId },
      select: { type: true },
    });

    if (!merchant || (merchant.type !== "PRODUCER" && merchant.type !== "RIFEIRO")) {
      return res.status(403).json({
        error: {
          code: "FORBIDDEN",
          message: "Apenas Producers ou Rifeiros podem buscar associados",
        },
      });
    }

    const { document } = searchSchema.parse(req.query);
    const useCase = new SearchRifeiroByDocument();

    const result = await useCase.execute({ document });

    return res.json(result);
  } catch (err) {
    if (err instanceof ZodError) {
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: err.message,
          details: err.flatten(),
        },
      });
    }
    logger.error({ err }, "Erro em GET /producer/splits/rifeiro/search");
    return res
      .status(500)
      .json({ error: { code: "INTERNAL_ERROR", message: "Erro interno" } });
  }
});

/**
 * POST /producer/splits/rifeiro/link
 * Associa um Rifeiro ao Producer com porcentagem de comissão
 * Se confirm=true, marca como locked (não pode mais editar/excluir)
 */
producerSplitsRouter.post("/rifeiro/link", async (req: Request, res: Response) => {
  logger.info({ path: req.path, url: req.url, method: req.method }, "POST /producer/splits/rifeiro/link chamado");
  try {
    if (!req.user?.id) {
      return res.status(401).json({
        error: { code: "UNAUTHORIZED", message: "Usuário não autenticado" },
      });
    }

    const merchantId = await ensureMerchantId(req.user.id);

    // Verificar se o merchant é PRODUCER ou RIFEIRO
    const merchant = await prisma.merchant.findUnique({
      where: { id: merchantId },
      select: { type: true },
    });

    if (!merchant || (merchant.type !== "PRODUCER" && merchant.type !== "RIFEIRO")) {
      return res.status(403).json({
        error: {
          code: "FORBIDDEN",
          message: "Apenas Producers ou Rifeiros podem associar associados",
        },
      });
    }

    const payload = linkRifeiroSchema.parse(req.body);

    // Buscar rifeiro; se não encontrado, permitir fallback com dados fornecidos
    const searchUseCase = new SearchRifeiroByDocument();
    const searchResult = await searchUseCase.execute({ document: payload.document });

    if (searchResult.found && searchResult.rifeiro && !searchResult.rifeiro.active) {
      return res.status(400).json({
        error: {
          code: "RIFEIRO_INACTIVE",
          message: "Rifeiro está inativo",
        },
      });
    }

    const fallbackNameFromEmail = searchResult.user?.email
      ? searchResult.user.email.split("@")[0]
      : undefined;

    const name =
      payload.name ??
      searchResult.rifeiro?.name ??
      fallbackNameFromEmail;

    const email = searchResult.rifeiro?.email ?? payload.email ?? searchResult.user?.email;
    const phone = payload.phone ?? searchResult.user?.phone ?? undefined;

    if (!name) {
      return res.status(400).json({
        error: {
          code: "NAME_REQUIRED",
          message: "Nome é obrigatório para criar o associado",
        },
      });
    }

    // Associar usando LinkAssociate (cria/atualiza affiliate + regra de comissão)
    const linkUseCase = new LinkAssociate();
    const result = await linkUseCase.execute({
      merchantId,
      document: payload.document,
      splitPercentage: payload.splitPercentage,
      name,
      email,
      phone,
      locked: payload.confirm, // Se confirm=true, marca como locked
    });

    return res.status(201).json({
      affiliate: result.affiliate,
      commissionRule: result.commissionRule,
      rifeiro: searchResult.rifeiro,
      message: payload.confirm
        ? "Rifeiro associado e bloqueado. Não é mais possível editar ou excluir."
        : "Rifeiro associado com sucesso. Confirme para bloquear.",
    });
  } catch (err) {
    if (err instanceof ZodError) {
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: err.message,
          details: err.flatten(),
        },
      });
    }

    const errorMessage = err instanceof Error ? err.message : "Erro desconhecido";
    if (errorMessage.includes("bloqueado")) {
      return res.status(403).json({
        error: {
          code: "AFFILIATE_LOCKED",
          message: errorMessage,
        },
      });
    }

    logger.error({ err }, "Erro em POST /producer/splits/rifeiro/link");
    return res
      .status(500)
      .json({ error: { code: "INTERNAL_ERROR", message: "Erro interno" } });
  }
});

/**
 * GET /producer/splits/associados
 * Lista todos os associados (Rifeiros) do Producer
 */
producerSplitsRouter.get("/associados", associadosLimiter, async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({
        error: { code: "UNAUTHORIZED", message: "Usuário não autenticado" },
      });
    }

    const merchantId = await ensureMerchantId(req.user.id);

    // Verificar se o merchant é PRODUCER ou RIFEIRO
    const merchant = await prisma.merchant.findUnique({
      where: { id: merchantId },
      select: { type: true },
    });

    if (!merchant || (merchant.type !== "PRODUCER" && merchant.type !== "RIFEIRO")) {
      return res.status(403).json({
        error: {
          code: "FORBIDDEN",
          message: "Apenas Producers ou Rifeiros podem listar associados",
        },
      });
    }

    const affiliates = await prisma.affiliate.findMany({
      where: { merchantId },
      orderBy: { createdAt: "desc" },
    });

    const affiliateIds = affiliates.map((a) => a.id);

    const commissionRules = await prisma.commissionRule.findMany({
      where: {
        merchantId,
        affiliateId: { in: affiliateIds },
        productId: null,
      },
    });

    const rulesByAffiliate = new Map(
      commissionRules.map((rule) => [rule.affiliateId ?? "", rule])
    );

    const result = affiliates.map((affiliate) => {
      const rule = rulesByAffiliate.get(affiliate.id);
      return {
        id: affiliate.id,
        name: affiliate.name,
        email: affiliate.email,
        document: affiliate.document,
        phone: affiliate.phone,
        splitPercentage:
          Number(rule?.value ?? affiliate.commissionRate) ?? undefined,
        locked: affiliate.locked ?? false,
        status: affiliate.active ? "ACTIVE" : "INACTIVE",
        createdAt: affiliate.createdAt,
        updatedAt: affiliate.updatedAt,
      };
    });

    return res.json({ items: result, total: result.length });
  } catch (err) {
    logger.error({ err }, "Erro em GET /producer/splits/associados");
    return res
      .status(500)
      .json({ error: { code: "INTERNAL_ERROR", message: "Erro interno" } });
  }
});

