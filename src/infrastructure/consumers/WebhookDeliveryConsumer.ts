/**
 * Consumer: WebhookDeliveryConsumer
 * 
 * Consome deliveries da fila turbofy.webhooks.delivery
 * Executa HTTP POST para o endpoint do integrador
 * Implementa retry com backoff exponencial + jitter
 * 
 * @scalability Workers horizontais com prefetch controlado
 * @reliability Retry automático, DLQ, circuit breaker
 */

import { WebhookEventEnvelope } from "../../application/useCases/DispatchWebhooks";
import { Webhook } from "../../domain/entities/Webhook";
import { MessagingFactory } from "../adapters/messaging/MessagingFactory";
import { EventHandler, RabbitMQConsumer } from "../adapters/messaging/RabbitMQConsumer";
import { FetchWebhookDeliveryAdapter } from "../adapters/webhooks/FetchWebhookDeliveryAdapter";
import { prisma } from "../database/prismaClient";
import { logger } from "../logger";

const DEFAULT_TIMEOUT_MS = 5_000; // 5 segundos
const MAX_ATTEMPTS = 5;
const RETRY_DELAYS_MS = [0, 2_000, 10_000, 60_000, 300_000]; // 0s, 2s, 10s, 1min, 5min
const JITTER_FACTOR = 0.1; // ±10% de jitter
const MAX_FAILURES_FOR_DISABLE = 10;

interface WebhookDeliveryMessage {
  deliveryId: string;
  webhookId: string;
  eventEnvelope: WebhookEventEnvelope;
}

export class WebhookDeliveryConsumer implements EventHandler {
  private webhookDelivery = new FetchWebhookDeliveryAdapter();

  async handle(event: unknown): Promise<void> {
    try {
      // O evento do RabbitMQ tem a estrutura:
      // { id, type: "webhook.delivery", payload: WebhookDeliveryMessage }
      // Precisamos extrair o payload que contém os dados reais da delivery
      const rawEvent = event as {
        id?: string;
        type?: string;
        payload?: WebhookDeliveryMessage;
      };

      // Extrair o WebhookDeliveryMessage do payload
      const message = rawEvent.payload as WebhookDeliveryMessage;

      if (!message || !message.deliveryId || !message.webhookId || !message.eventEnvelope) {
        logger.warn({
          type: "WEBHOOK_DELIVERY_INVALID_MESSAGE",
          message: "Mensagem de delivery inválida (faltando campos no payload)",
          payload: { 
            event,
            hasPayload: !!rawEvent.payload,
            deliveryId: message?.deliveryId,
            webhookId: message?.webhookId,
            hasEventEnvelope: !!message?.eventEnvelope,
            tip: "O evento deve ter a estrutura { payload: { deliveryId, webhookId, eventEnvelope } }",
          },
        });
        return;
      }

      logger.info({
        type: "WEBHOOK_DELIVERY_PROCESSING",
        message: "Processando delivery de webhook",
        payload: {
          deliveryId: message.deliveryId,
          webhookId: message.webhookId,
          eventId: message.eventEnvelope.id,
          eventType: message.eventEnvelope.type,
        },
      });

      // Buscar delivery
      const delivery = await prisma.webhookDelivery.findUnique({
        where: { id: message.deliveryId },
        include: { webhook: true },
      });

      if (!delivery) {
        logger.warn({
          type: "WEBHOOK_DELIVERY_NOT_FOUND",
          message: "WebhookDelivery não encontrado",
          payload: { deliveryId: message.deliveryId },
        });
        return;
      }

      // Se já foi entregue com sucesso, não processar novamente
      if (delivery.status === "SUCCESS") {
        logger.info({
          type: "WEBHOOK_DELIVERY_ALREADY_SUCCESS",
          message: "Delivery já foi entregue com sucesso",
          payload: { deliveryId: message.deliveryId },
        });
        return;
      }

      const webhook = delivery.webhook;

      // Verificar se webhook ainda está ativo
      if (webhook.status !== "ACTIVE") {
        logger.info({
          type: "WEBHOOK_DELIVERY_WEBHOOK_INACTIVE",
          message: "Webhook não está ativo, cancelando delivery",
          payload: {
            deliveryId: delivery.id,
            webhookId: webhook.id,
            webhookStatus: webhook.status,
          },
        });

        await prisma.webhookDelivery.update({
          where: { id: delivery.id },
          data: { status: "FAILED", errorMessage: "Webhook não está ativo" },
        });
        return;
      }

      // Executar tentativa de entrega
      const success = await this.attemptDelivery({
        delivery,
        webhook,
        eventEnvelope: message.eventEnvelope,
      });

      // Se falhou e ainda tem tentativas, re-enfileirar com backoff
      if (!success && delivery.attempt < MAX_ATTEMPTS) {
        await this.scheduleRetry({
          delivery,
          message,
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      logger.error({
        type: "WEBHOOK_DELIVERY_CONSUMER_ERROR",
        message: "Erro ao processar delivery de webhook",
        error,
        payload: { error: errorMessage, event },
      });
      throw error;
    }
  }

  /**
   * Tenta entregar o webhook ao endpoint do integrador
   */
  private async attemptDelivery(params: {
    delivery: any;
    webhook: any;
    eventEnvelope: WebhookEventEnvelope;
  }): Promise<boolean> {
    const { delivery, webhook, eventEnvelope } = params;
    const body = JSON.stringify(eventEnvelope);

    // Gerar assinatura
    const ts = Date.now();
    const signedPayload = `${ts}.${body}`;
    const signature = Webhook.generateSignature(signedPayload, webhook.secret);

    const start = Date.now();
    try {
      const response = await this.webhookDelivery.post({
        url: webhook.url,
        timeoutMs: DEFAULT_TIMEOUT_MS,
        headers: {
          "content-type": "application/json",
          "user-agent": "Turbofy Webhooks/1.0",
          "turbofy-event-id": eventEnvelope.id,
          "turbofy-event-type": eventEnvelope.type,
          "turbofy-signature": `t=${ts},v1=${signature}`,
        },
        body,
      });

      const responseTimeMs = Date.now() - start;
      const success = response.status >= 200 && response.status < 300;

      // Criar log da tentativa
      await prisma.webhookLog.create({
        data: {
          webhookId: webhook.id,
          event: eventEnvelope.type,
          payload: eventEnvelope as any,
          responseCode: response.status,
          responseBody: response.responseBody?.substring(0, 1000), // Truncar
          responseTime: responseTimeMs,
          success,
          errorMessage: success ? null : `HTTP_${response.status}`,
          attemptNumber: delivery.attempt,
        },
      });

      if (success) {
        // Atualizar delivery como SUCCESS
        await prisma.webhookDelivery.update({
          where: { id: delivery.id },
          data: {
            status: "SUCCESS",
            httpStatus: response.status,
            updatedAt: new Date(),
          },
        });

        // Atualizar webhook (resetar failureCount)
        await prisma.webhook.update({
          where: { id: webhook.id },
          data: {
            status: "ACTIVE",
            failureCount: 0,
            lastCalledAt: new Date(),
            lastSuccess: new Date(),
            lastError: null,
            updatedAt: new Date(),
          },
        });

        logger.info({
          type: "WEBHOOK_DELIVERY_SUCCESS",
          message: "Webhook entregue com sucesso",
          payload: {
            deliveryId: delivery.id,
            webhookId: webhook.id,
            eventId: eventEnvelope.id,
            attempt: delivery.attempt,
            responseTime: responseTimeMs,
          },
        });

        return true;
      }

      // Falha HTTP (status não 2xx)
      await this.handleDeliveryFailure({
        delivery,
        webhook,
        errorMessage: `HTTP_${response.status}`,
        httpStatus: response.status,
      });

      return false;
    } catch (err) {
      // Falha de rede/timeout
      const responseTimeMs = Date.now() - start;
      const errorMessage = err instanceof Error ? err.message : "Unknown error";

      await prisma.webhookLog.create({
        data: {
          webhookId: webhook.id,
          event: eventEnvelope.type,
          payload: eventEnvelope as any,
          responseCode: null,
          responseBody: null,
          responseTime: responseTimeMs,
          success: false,
          errorMessage,
          attemptNumber: delivery.attempt,
        },
      });

      await this.handleDeliveryFailure({
        delivery,
        webhook,
        errorMessage,
        httpStatus: null,
      });

      return false;
    }
  }

  /**
   * Trata falha de entrega
   */
  private async handleDeliveryFailure(params: {
    delivery: any;
    webhook: any;
    errorMessage: string;
    httpStatus: number | null;
  }): Promise<void> {
    const { delivery, webhook, errorMessage, httpStatus } = params;

    // Atualizar delivery
    await prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: {
        status: delivery.attempt >= MAX_ATTEMPTS ? "FAILED" : "RETRYING",
        httpStatus,
        errorMessage,
        updatedAt: new Date(),
      },
    });

    // Atualizar webhook (incrementar failureCount)
    const newFailureCount = webhook.failureCount + 1;
    const shouldDisable = newFailureCount >= MAX_FAILURES_FOR_DISABLE;

    await prisma.webhook.update({
      where: { id: webhook.id },
      data: {
        status: shouldDisable ? "FAILED" : webhook.status,
        failureCount: newFailureCount,
        lastCalledAt: new Date(),
        lastFailure: new Date(),
        lastError: errorMessage,
        updatedAt: new Date(),
      },
    });

    if (shouldDisable) {
      logger.warn({
        type: "WEBHOOK_DISABLED_AUTO",
        message: "Webhook desabilitado automaticamente por excesso de falhas",
        payload: {
          webhookId: webhook.id,
          failureCount: newFailureCount,
        },
      });
    }

    logger.error({
      type: "WEBHOOK_DELIVERY_FAILED",
      message: "Falha ao entregar webhook",
      payload: {
        deliveryId: delivery.id,
        webhookId: webhook.id,
        attempt: delivery.attempt,
        errorMessage,
        httpStatus,
      },
    });
  }

  /**
   * Agenda retry com backoff exponencial + jitter
   */
  private async scheduleRetry(params: {
    delivery: any;
    message: WebhookDeliveryMessage;
  }): Promise<void> {
    const { delivery, message } = params;

    const nextAttempt = delivery.attempt + 1;

    if (nextAttempt > MAX_ATTEMPTS) {
      // Atingiu máximo de tentativas, enviar para DLQ seria feito automaticamente pelo RabbitMQ
      logger.error({
        type: "WEBHOOK_DELIVERY_MAX_ATTEMPTS",
        message: "Atingiu número máximo de tentativas",
        payload: {
          deliveryId: delivery.id,
          webhookId: delivery.webhookId,
          maxAttempts: MAX_ATTEMPTS,
        },
      });

      await prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: { status: "FAILED" },
      });

      return;
    }

    // Calcular delay com jitter
    const baseDelay = RETRY_DELAYS_MS[nextAttempt - 1];
    const jitter = baseDelay * JITTER_FACTOR * (Math.random() * 2 - 1); // -10% a +10%
    const delayMs = Math.max(0, baseDelay + jitter);

    const nextAttemptAt = new Date(Date.now() + delayMs);

    // Atualizar delivery com próxima tentativa agendada
    await prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: {
        attempt: nextAttempt,
        nextAttemptAt,
        status: "RETRYING",
      },
    });

    // Re-publicar na fila com delay (usando TTL ou scheduler externo)
    // Por simplicidade, aguardar delay e republicar
    setTimeout(async () => {
      const messaging = MessagingFactory.create();
      await messaging.publish({
        id: `retry_${delivery.id}_${nextAttempt}`,
        type: "webhook.delivery",
        timestamp: new Date().toISOString(),
        version: "v1",
        routingKey: `turbofy.webhooks.delivery.${delivery.id}`,
        payload: message,
      });

      logger.info({
        type: "WEBHOOK_DELIVERY_RETRY_SCHEDULED",
        message: "Retry agendado",
        payload: {
          deliveryId: delivery.id,
          nextAttempt,
          delayMs: Math.round(delayMs),
          nextAttemptAt: nextAttemptAt.toISOString(),
        },
      });
    }, delayMs);
  }
}

/**
 * Inicializa o consumer de WebhookDelivery
 */
export async function startWebhookDeliveryConsumer(): Promise<RabbitMQConsumer> {
  // Configurar binding para a fila de delivery de webhooks
  const consumer = new RabbitMQConsumer([
    {
      eventType: "webhook.delivery",
      queueName: "turbofy.webhooks.delivery",
    },
  ]);
  
  const handler = new WebhookDeliveryConsumer();

  // Registrar handler para o evento de delivery
  consumer.registerHandler("webhook.delivery", handler);

  await consumer.start();

  logger.info({
    type: "WEBHOOK_DELIVERY_STARTED",
    message: "WebhookDeliveryConsumer started",
    queue: "turbofy.webhooks.delivery",
  });

  return consumer;
}
