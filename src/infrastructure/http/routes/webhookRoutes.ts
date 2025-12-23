import { Router } from "express";
import { WebhookController } from "../controllers/WebhookController";

const webhookRouter = Router();
const controller = new WebhookController();

// Webhook da Transfeera (sem autenticação - validação via assinatura)
webhookRouter.post("/transfeera", controller.handleTransfeeraWebhook.bind(controller));

export { webhookRouter };

