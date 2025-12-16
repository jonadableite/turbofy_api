import { randomUUID } from "crypto";
import { Router } from "express";
import { z, ZodError } from "zod";
import { CreateWebhook } from "../../../application/useCases/CreateWebhook";
import { prisma } from "../../database/prismaClient";
import { PrismaProviderCredentialsRepository } from "../../database/repositories/PrismaProviderCredentialsRepository";
import { PrismaWebhookRepository } from "../../database/repositories/PrismaWebhookRepository";
import { logger } from "../../logger";
import { decryptSecret } from "../../security/crypto";
import { AdminVerificationController } from "../controllers/AdminVerificationController";
import { authMiddleware } from "../middlewares/authMiddleware";
import { requireRoles } from "../middlewares/requireRole";

const adminRouter = Router();
const controller = new AdminVerificationController();
const RIFEIRO_PROVIDER = "RIFEIRO_PIX";

adminRouter.use(authMiddleware, requireRoles("ADMIN"));

adminRouter.get("/verifications", controller.listPending.bind(controller));
adminRouter.post("/verifications/:merchantId/approve", controller.approve.bind(controller));
adminRouter.post("/verifications/:merchantId/reject", controller.reject.bind(controller));
adminRouter.get("/documents", controller.listDocuments.bind(controller));
adminRouter.patch("/documents/:documentId/status", controller.updateDocumentStatus.bind(controller));
adminRouter.get("/notifications", controller.getNotifications.bind(controller));

adminRouter.patch("/merchants/:merchantId/type", async (req, res) => {
  try {
    const parsed = z
      .object({ type: z.enum(["PRODUCER", "RIFEIRO"]) })
      .parse(req.body);

    const merchant = await prisma.merchant.update({
      where: { id: req.params.merchantId },
      data: { type: parsed.type },
      select: { id: true, type: true, name: true },
    });

    return res.json({
      id: merchant.id,
      name: merchant.name,
      type: merchant.type,
    });
  } catch (err) {
    if (err instanceof ZodError) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: err.message, details: err.flatten() },
      });
    }
    logger.error({ err }, "Erro ao atualizar tipo de merchant");
    return res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Erro interno" } });
  }
});

adminRouter.post("/merchants/:merchantId/credentials/rifeiro", async (req, res) => {
  try {
    const repo = new PrismaProviderCredentialsRepository();
    const clientId = `rf_${randomUUID()}`;
    const clientSecret = randomUUID();

    const credentials = await repo.upsert({
      merchantId: req.params.merchantId,
      provider: RIFEIRO_PROVIDER,
      clientId,
      clientSecret,
    });

    return res.status(201).json({
      provider: RIFEIRO_PROVIDER,
      merchantId: credentials.merchantId,
      clientId: credentials.clientId,
      clientSecret,
    });
  } catch (err) {
    logger.error({ err }, "Erro ao gerar credenciais para rifeiro");
    return res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Erro interno" } });
  }
});

adminRouter.post("/merchants/:merchantId/credentials/test", async (req, res) => {
  try {
    const { merchantId } = req.params;
    const { clientId, clientSecret } = z
      .object({
        clientId: z.string().min(1),
        clientSecret: z.string().min(1),
      })
      .parse(req.body);

    // Verificar se as credenciais pertencem ao merchant
    const credentials = await prisma.providerCredentials.findFirst({
      where: {
        merchantId,
        provider: RIFEIRO_PROVIDER,
        clientId,
      },
    });

    if (!credentials) {
      return res.status(404).json({
        error: { code: "CREDENTIALS_NOT_FOUND", message: "Credenciais não encontradas para este comerciante" },
      });
    }

    // Descriptografar e validar o secret
    let decryptedSecret: string;
    try {
      decryptedSecret = decryptSecret(credentials.clientSecret);
    } catch (err) {
      logger.error({ err }, "Erro ao descriptografar secret");
      return res.status(500).json({
        error: { code: "DECRYPTION_ERROR", message: "Erro ao descriptografar credenciais" },
      });
    }

    if (decryptedSecret !== clientSecret) {
      return res.json({
        valid: false,
        message: "Client Secret inválido",
        error: "INVALID_SECRET",
      });
    }

    // Verificar se o merchant é do tipo RIFEIRO e está active
    const merchant = await prisma.merchant.findUnique({
      where: { id: merchantId },
      select: { type: true, active: true },
    });

    if (!merchant) {
      return res.json({
        valid: false,
        message: "Comerciante não encontrado",
        error: "MERCHANT_NOT_FOUND",
      });
    }

    if (merchant.type !== "RIFEIRO") {
      return res.json({
        valid: false,
        message: "Comerciante não é do tipo RIFEIRO",
        error: "INVALID_MERCHANT_TYPE",
      });
    }

    if (!merchant.active) {
      return res.json({
        valid: false,
        message: "Comerciante não está ativo",
        error: "MERCHANT_INACTIVE",
      });
    }

    // Credenciais válidas no banco do Turbofy
    // O Turbofy usa suas próprias credenciais para se comunicar com a Transfeera
    return res.json({
      valid: true,
      message: "Credenciais válidas na API do Turbofy",
      environment: "api",
    });
  } catch (err) {
    if (err instanceof ZodError) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: err.message, details: err.flatten() },
      });
    }
    logger.error({ err }, "Erro ao testar credenciais do rifeiro");
    return res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Erro interno" } });
  }
});

adminRouter.post("/merchants/create-for-user/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const { type = "PRODUCER" } = req.body;

    // Verificar se usuário existe
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, document: true, merchantId: true },
    });

    if (!user) {
      return res.status(404).json({
        error: { code: "USER_NOT_FOUND", message: "Usuário não encontrado" },
      });
    }

    if (user.merchantId) {
      return res.status(400).json({
        error: {
          code: "MERCHANT_ALREADY_EXISTS",
          message: "Usuário já possui um merchant associado",
        },
      });
    }

    // Criar merchant para o usuário - usar dados do USER como fonte de verdade
    const nameFromEmail = user.email.split("@")[0] || "Usuário";
    const merchant = await prisma.merchant.create({
      data: {
        name: nameFromEmail,
        email: user.email, // SEMPRE do user (fonte de verdade)
        document: user.document, // SEMPRE do user (fonte de verdade)
        type: type === "RIFEIRO" ? "RIFEIRO" : "PRODUCER",
        active: true,
        users: {
          connect: { id: userId },
        },
      },
      select: {
        id: true,
        name: true,
        email: true,
        document: true,
        type: true,
        active: true,
        createdAt: true,
      },
    });

    logger.info({ userId, merchantId: merchant.id }, "Merchant criado para usuário pelo admin");

    return res.status(201).json({
      id: merchant.id,
      name: merchant.name,
      email: merchant.email,
      document: merchant.document,
      type: merchant.type,
      active: merchant.active,
      createdAt: merchant.createdAt.toISOString(),
    });
  } catch (err) {
    logger.error({ err, userId: req.params.userId }, "Erro ao criar merchant para usuário");
    return res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Erro interno" } });
  }
});

adminRouter.post("/merchants/:merchantId/webhook", async (req, res) => {
  try {
    const parsed = z
      .object({
        url: z.string().url(),
        events: z.array(z.string()).min(1).default(["charge.created", "charge.paid"]),
        name: z.string().default("Webhook Rifeiro"),
      })
      .parse(req.body);

    const webhookRepository = new PrismaWebhookRepository(prisma);
    const useCase = new CreateWebhook(webhookRepository);

    const result = await useCase.execute({
      merchantId: req.params.merchantId,
      name: parsed.name,
      url: parsed.url,
      events: parsed.events,
      devMode: false,
    });

    return res.status(201).json({
      id: result.id,
      publicId: result.publicId,
      secret: result.secret,
      url: result.url,
      events: result.events,
    });
  } catch (err) {
    if (err instanceof ZodError) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: err.message, details: err.flatten() },
      });
    }
    logger.error({ err }, "Erro ao configurar webhook do rifeiro");
    return res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Erro interno" } });
  }
});

adminRouter.get("/merchants", async (req, res) => {
  try {
    const { search, type, page = "1", limit = "20" } = req.query;
    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const skip = (pageNum - 1) * limitNum;

    // Buscar todos os usuários (exceto dev/test) com seus merchants
    const userWhere: any = {
      NOT: {
        OR: [
          { email: { contains: "@turbofy.local", mode: "insensitive" } },
          { email: { contains: "dev@", mode: "insensitive" } },
          { email: { contains: "demo", mode: "insensitive" } },
          { email: { contains: "test", mode: "insensitive" } },
          { document: "00000000000000" },
          { document: "00000000000" },
        ],
      },
    };

    if (search) {
      userWhere.OR = [
        { email: { contains: search as string, mode: "insensitive" } },
        { document: { contains: search as string, mode: "insensitive" } },
      ];
    }

    // Buscar usuários com seus merchants e profiles
    const [users, totalUsers] = await Promise.all([
      prisma.user.findMany({
        where: userWhere,
        skip,
        take: limitNum,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          email: true,
          document: true,
          createdAt: true,
          merchant: {
            select: {
              id: true,
              name: true,
              email: true,
              document: true,
              type: true,
              active: true,
              createdAt: true,
              profile: {
                select: {
                  fullName: true,
                },
              },
            },
          },
        },
      }),
      prisma.user.count({ where: userWhere }),
    ]);

    // Mapear para o formato esperado - garantir dados consistentes do usuário
    const merchants = users
      .map((user) => {
        if (user.merchant) {
          // Usuário com merchant - usar dados do USER como fonte de verdade
          // O merchant pode ter dados desatualizados, então sempre usamos os dados do user
          const displayName =
            user.merchant.profile?.fullName || user.merchant.name || user.email.split("@")[0];
          return {
            id: user.merchant.id,
            name: displayName,
            email: user.email, // SEMPRE do user (fonte de verdade)
            document: user.document, // SEMPRE do user (fonte de verdade)
            type: user.merchant.type,
            active: user.merchant.active,
            createdAt: user.merchant.createdAt.toISOString(),
            user: {
              id: user.id,
              email: user.email,
              document: user.document,
            },
          };
        } else {
          // Usuário sem merchant - usar dados do user
          const nameFromEmail = user.email.split("@")[0] || "Usuário";
          return {
            id: `user-${user.id}`,
            name: nameFromEmail,
            email: user.email, // Dados do user
            document: user.document, // Dados do user
            type: "PRODUCER" as const,
            active: false,
            createdAt: user.createdAt.toISOString(),
            user: {
              id: user.id,
              email: user.email,
              document: user.document,
            },
            _isUserWithoutMerchant: true,
          };
        }
      })
      .filter((m) => {
        // Aplicar filtro de tipo se especificado
        if (type) {
          // Se for usuário sem merchant, só mostrar se o tipo for PRODUCER
          if (m._isUserWithoutMerchant) {
            return type === "PRODUCER";
          }
          return m.type === type;
        }
        return true;
      });

    return res.json({
      merchants,
      total: totalUsers,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(totalUsers / limitNum),
    });
  } catch (err) {
    logger.error({ err }, "Erro ao listar merchants");
    return res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Erro interno" } });
  }
});

export { adminRouter };

