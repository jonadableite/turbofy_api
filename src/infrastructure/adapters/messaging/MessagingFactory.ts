/**
 * Factory para criar instâncias de MessagingPort
 * Escolhe entre RabbitMQMessagingAdapter (prod) e InMemoryMessagingAdapter (dev/test)
 * 
 * @maintainability Centraliza a lógica de escolha do adapter
 * @testability Facilita mock em testes
 */

import { env } from "../../../config/env";
import { MessagingPort } from "../../../ports/MessagingPort";
import { logger } from "../../logger";
import { InMemoryMessagingAdapter } from "./InMemoryMessagingAdapter";
import { RabbitMQMessagingAdapter } from "./RabbitMQMessagingAdapter";

export class MessagingFactory {
  /**
   * Cria uma instância do MessagingPort baseado na configuração
   */
  static create(): MessagingPort {
    // Em teste, sempre usar InMemory para evitar dependência de RabbitMQ
    if (env.NODE_ENV === "test") {
      return new InMemoryMessagingAdapter();
    }

    // Em desenvolvimento, tentar RabbitMQ mas fallback para InMemory se não disponível
    if (env.NODE_ENV === "development") {
      // Verificar se RABBITMQ_URI está configurado e não é localhost
      const hasRabbitMQ = env.RABBITMQ_URI && !env.RABBITMQ_URI.includes("localhost");
      if (!hasRabbitMQ) {
        logger.warn("RABBITMQ_URI not configured or pointing to localhost, using InMemory adapter");
        return new InMemoryMessagingAdapter();
      }
      
      // Tentar criar RabbitMQ, mas fallback para InMemory se falhar
      try {
        return new RabbitMQMessagingAdapter();
      } catch (error) {
        logger.warn({ error }, "Failed to create RabbitMQ adapter, using InMemory adapter");
        return new InMemoryMessagingAdapter();
      }
    }

    // Em produção, sempre usar RabbitMQ
    return new RabbitMQMessagingAdapter();
  }
}

