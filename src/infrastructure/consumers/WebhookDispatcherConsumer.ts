/**
 * Consumer: WebhookDispatcherConsumer
 * 
 * Consome eventos da fila turbofy.webhooks.dispatch
 * Para cada evento, busca webhooks ACTIVE do merchant e cria WebhookDelivery
 * 
 * @scalability Processa eventos em paralelo (configurar prefetch)
 * @reliability Idempotência garantida por unique constraint (webhookId + eventId)
 */

import { WebhookEventEnvelope } from "../../application/useCases/DispatchWebhooks";
import { MessagingFactory } from "../adapters/messaging/MessagingFactory";
import { EventHandler, RabbitMQConsumer } from "../adapters/messaging/RabbitMQConsumer";
import { prisma } from "../database/prismaClient";
import { logger } from "../logger";

export class WebhookDispatcherConsumer implements EventHandler {
  async handle(event: unknown): Promise<void> {
    try {
      const envelope = event as WebhookEventEnvelope;

      if (!envelope.id || !envelope.type || !envelope.merchantId) {
        logger.warn({
          type: "WEBHOOK_DISPATCHER_INVALID_EVENT",
          message: "Evento de webhook inválido (faltando campos obrigatórios)",
          payload: { event },
        });
        return;
      }

      // Buscar webhooks ACTIVE do merchant que escutam este evento
      const webhooks = await prisma.webhook.findMany({
        where: {
          merchantId: envelope.merchantId,
          status: "ACTIVE",
          events: {
            has: envelope.type,
          },
        },
      });

      if (webhooks.length === 0) {
        logger.info({
          type: "WEBHOOK_DISPATCHER_NO_WEBHOOKS",
          message: "Nenhum webhook ativo encontrado para este evento",
          payload: {
            eventId: envelope.id,
            eventType: envelope.type,
            merchantId: envelope.merchantId,
          },
        });
        return;
      }

      logger.info({
        type: "WEBHOOK_DISPATCHER_FOUND_WEBHOOKS",
        message: `Encontrados ${webhooks.length} webhooks ativos`,
        payload: {
          eventId: envelope.id,
          eventType: envelope.type,
          merchantId: envelope.merchantId,
          webhookCount: webhooks.length,
        },
      });

      // Para cada webhook, criar WebhookDelivery e publicar na fila de entrega
      const messaging = MessagingFactory.create();

      for (const webhook of webhooks) {
        try {
          // Criar WebhookDelivery (idempotente por unique constraint)
          const delivery = await prisma.webhookDelivery.upsert({
            where: {
              webhookId_eventId: {
                webhookId: webhook.id,
                eventId: envelope.id,
              },
            },
            create: {
              webhookId: webhook.id,
              eventId: envelope.id,
              eventType: envelope.type,
              attempt: 1,
              status: "PENDING",
            },
            update: {
              // Se já existe, não faz nada (idempotência)
            },
          });

          // Publicar na fila de entrega
          await messaging.publish({
            id: `del_${delivery.id}`,
            type: "webhook.delivery",
            timestamp: new Date().toISOString(),
            version: "v1",
            routingKey: `turbofy.webhooks.delivery.${delivery.id}`,
            payload: {
              deliveryId: delivery.id,
              webhookId: webhook.id,
              eventEnvelope: envelope,
            },
          });

          logger.info({
            type: "WEBHOOK_DISPATCHER_DELIVERY_CREATED",
            message: "WebhookDelivery criado e publicado",
            payload: {
              deliveryId: delivery.id,
              webhookId: webhook.id,
              eventId: envelope.id,
            },
          });
        } catch (err) {
          // Se falhar para um webhook específico, continua com os outros
          logger.error({
            type: "WEBHOOK_DISPATCHER_DELIVERY_FAILED",
            message: "Falha ao criar WebhookDelivery",
            error: err,
            payload: {
              webhookId: webhook.id,
              eventId: envelope.id,
            },
          });
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      logger.error({
        type: "WEBHOOK_DISPATCHER_ERROR",
        message: "Erro ao processar evento de webhook",
        error,
        payload: { error: errorMessage, event },
      });
      throw error;
    }
  }
}

/**
 * Inicializa o consumer de WebhookDispatcher
 */
export async function startWebhookDispatcherConsumer(): Promise<RabbitMQConsumer> {
  // Configurar binding para a fila de dispatch de webhooks
  const consumer = new RabbitMQConsumer([
    {
      eventType: "webhook.dispatch",
      queueName: "turbofy.webhooks.dispatch",
    },
  ]);
  
  const handler = new WebhookDispatcherConsumer();

  // Registrar handler para o evento de dispatch
  consumer.registerHandler("webhook.dispatch", handler);

  await consumer.start();

  logger.info({
    type: "WEBHOOK_DISPATCHER_STARTED",
    message: "WebhookDispatcherConsumer started",
    queue: "turbofy.webhooks.dispatch",
  });

  return consumer;
}
