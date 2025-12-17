import { Router, Request, Response } from "express"
import rateLimit from "express-rate-limit"
import { z, ZodError } from "zod"
import { TransfeeraWebhookService } from "../../../application/services/TransfeeraWebhookService"
import { TransfeeraClient } from "../../adapters/payment/TransfeeraClient"
import { prisma } from "../../database/prismaClient"
import { PrismaTransfeeraWebhookConfigRepository } from "../../database/repositories/PrismaTransfeeraWebhookConfigRepository"
import { logger } from "../../logger"
import { authMiddleware } from "../middlewares/authMiddleware"
import { ensureMerchantId } from "../utils/ensureMerchantId"

const rifeiroWebhookRouter = Router()

const webhookService = new TransfeeraWebhookService(
  new PrismaTransfeeraWebhookConfigRepository(),
  new TransfeeraClient(),
)

const createSchema = z.object({
  url: z.string().url(),
  objectTypes: z.array(z.string()).nonempty().default(["Payin", "CashIn", "ChargeReceivable"]),
})

const updateSchema = z.object({
  url: z.string().url().optional(),
  objectTypes: z.array(z.string()).nonempty().optional(),
})

const testSchema = z.object({
  id: z.string().min(1),
})

const webhooksRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: "Too many webhook requests, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
})

const assertRifeiro = async (merchantId: string): Promise<void> => {
  const merchant = await prisma.merchant.findUnique({
    where: { id: merchantId },
    select: { type: true },
  })

  if (!merchant || merchant.type !== "RIFEIRO") {
    throw new Error("FORBIDDEN_RIFEIRO_ONLY")
  }
}

rifeiroWebhookRouter.use(authMiddleware, webhooksRateLimiter)

rifeiroWebhookRouter.post("/", async (req: Request, res: Response) => {
  try {
    const { url, objectTypes } = createSchema.parse(req.body)
    if (!req.user) {
      return res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Usuário não autenticado" } })
    }
    const merchantId = await ensureMerchantId(req.user.id)
    await assertRifeiro(merchantId)

    const created = await webhookService.createWebhook(merchantId, url, objectTypes)
    return res.status(201).json(created)
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ error: { code: "VALIDATION_ERROR", details: error.issues } })
    }
    if (error instanceof Error && error.message === "FORBIDDEN_RIFEIRO_ONLY") {
      return res.status(403).json({ error: { code: "FORBIDDEN", message: "Apenas rifeiros podem configurar webhooks" } })
    }
    logger.error({ error }, "Error creating webhook")
    return res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Erro ao criar webhook" } })
  }
})

rifeiroWebhookRouter.get("/", async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Usuário não autenticado" } })
    }
    const merchantId = await ensureMerchantId(req.user.id)
    await assertRifeiro(merchantId)

    const list = await webhookService.listWebhooks(merchantId)
    return res.json(list)
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN_RIFEIRO_ONLY") {
      return res.status(403).json({ error: { code: "FORBIDDEN", message: "Apenas rifeiros podem listar webhooks" } })
    }
    logger.error({ error }, "Error listing webhooks")
    return res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Erro ao listar webhooks" } })
  }
})

rifeiroWebhookRouter.put("/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { url, objectTypes } = updateSchema.parse(req.body)
    if (!req.user) {
      return res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Usuário não autenticado" } })
    }
    const merchantId = await ensureMerchantId(req.user.id)
    await assertRifeiro(merchantId)

    if (!url && !objectTypes) {
      return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "URL ou objectTypes são obrigatórios" } })
    }

    const updated = await webhookService.updateWebhook(merchantId, id, url ?? "", objectTypes ?? [])
    return res.json(updated)
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ error: { code: "VALIDATION_ERROR", details: error.issues } })
    }
    if (error instanceof Error && error.message === "WEBHOOK_NOT_FOUND") {
      return res.status(404).json({ error: { code: "WEBHOOK_NOT_FOUND", message: "Webhook não encontrado" } })
    }
    if (error instanceof Error && error.message === "FORBIDDEN_RIFEIRO_ONLY") {
      return res.status(403).json({ error: { code: "FORBIDDEN", message: "Apenas rifeiros podem atualizar webhooks" } })
    }
    logger.error({ error }, "Error updating webhook")
    return res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Erro ao atualizar webhook" } })
  }
})

rifeiroWebhookRouter.delete("/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    if (!req.user) {
      return res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Usuário não autenticado" } })
    }
    const merchantId = await ensureMerchantId(req.user.id)
    await assertRifeiro(merchantId)

    await webhookService.deleteWebhook(merchantId, id)
    return res.status(204).send()
  } catch (error) {
    if (error instanceof Error && error.message === "WEBHOOK_NOT_FOUND") {
      return res.status(404).json({ error: { code: "WEBHOOK_NOT_FOUND", message: "Webhook não encontrado" } })
    }
    if (error instanceof Error && error.message === "FORBIDDEN_RIFEIRO_ONLY") {
      return res.status(403).json({ error: { code: "FORBIDDEN", message: "Apenas rifeiros podem excluir webhooks" } })
    }
    logger.error({ error }, "Error deleting webhook")
    return res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Erro ao excluir webhook" } })
  }
})

rifeiroWebhookRouter.post("/:id/test", async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Usuário não autenticado" } })
    }
    const merchantId = await ensureMerchantId(req.user.id)
    await assertRifeiro(merchantId)
    const { id } = testSchema.parse({ id: req.params.id })

    const result = await webhookService.testWebhook(merchantId, id)
    return res.json(result)
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ error: { code: "VALIDATION_ERROR", details: error.issues } })
    }
    if (error instanceof Error && error.message === "WEBHOOK_NOT_FOUND") {
      return res.status(404).json({ error: { code: "WEBHOOK_NOT_FOUND", message: "Webhook não encontrado" } })
    }
    if (error instanceof Error && error.message === "WEBHOOK_SECRET_MISSING") {
      return res.status(400).json({ error: { code: "WEBHOOK_SECRET_MISSING", message: "Secret não configurado" } })
    }
    if (error instanceof Error && error.message === "FORBIDDEN_RIFEIRO_ONLY") {
      return res.status(403).json({ error: { code: "FORBIDDEN", message: "Apenas rifeiros podem testar webhooks" } })
    }
    logger.error({ error }, "Error testing webhook")
    return res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Erro ao testar webhook" } })
  }
})

export { rifeiroWebhookRouter }

