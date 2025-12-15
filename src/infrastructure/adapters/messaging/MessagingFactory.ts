/**
 * Factory para criar instâncias de MessagingPort
 * Escolhe entre RabbitMQMessagingAdapter (prod) e InMemoryMessagingAdapter (dev/test)
 * 
 * @maintainability Centraliza a lógica de escolha do adapter
 * @testability Facilita mock em testes
 */

import { MessagingPort } from "../../../ports/MessagingPort";
import { RabbitMQMessagingAdapter } from "./RabbitMQMessagingAdapter";
import { InMemoryMessagingAdapter } from "./InMemoryMessagingAdapter";
import { env } from "../../../config/env";
import { logger } from "../../logger";

export class MessagingFactory {
  /**
   * Cria uma instância do MessagingPort baseado na configuração
   */
  static create(): MessagingPort {
    // Em desenvolvimento/teste, usar InMemory se RABBITMQ_URI não estiver configurado corretamente
    if (env.NODE_ENV === "test" || env.RABBITMQ_URI.includes("localhost") && env.NODE_ENV === "development") {
      // Tentar usar RabbitMQ, mas fallback para InMemory se falhar
      try {
        return new RabbitMQMessagingAdapter();
      } catch (error) {
        logger.warn("Failed to create RabbitMQ adapter, using InMemory adapter");
        return new InMemoryMessagingAdapter();
      }
    }

    // Em produção, sempre usar RabbitMQ
    return new RabbitMQMessagingAdapter();
  }
}

