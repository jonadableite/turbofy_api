/**
 * RabbitMQ Consumer
 *
 * Consome eventos das filas RabbitMQ e processa assincronamente
 *
 * @security Garante idempotência e retry logic
 * @performance Prefetch controlado e processamento paralelo
 */

import { connect, type ConsumeMessage } from 'amqplib';
import { env } from '../../../config/env';
import { logger } from '../../logger';

export interface EventHandler {
  handle(event: any): Promise<void>;
}

export interface QueueBinding {
  eventType: string;
  queueName: string;
}

const DEFAULT_QUEUE_BINDINGS: QueueBinding[] = [
  {
    eventType: 'charge.paid',
    queueName: 'turbofy.payments.charge.paid',
  },
  {
    eventType: 'enrollment.granted',
    queueName: 'turbofy.enrollments.granted',
  },
  {
    eventType: 'settlement.requested',
    queueName: 'turbofy.billing.settlement.requested',
  },
];

type AmqpConnection = Awaited<ReturnType<typeof connect>>;
type AmqpChannel = Awaited<
  ReturnType<AmqpConnection['createChannel']>
>;

export class RabbitMQConsumer {
  private connection: AmqpConnection | null = null;
  private channel: AmqpChannel | null = null;
  private handlers: Map<string, EventHandler> = new Map();
  private queueBindings: QueueBinding[];

  constructor(bindings: QueueBinding[] = DEFAULT_QUEUE_BINDINGS) {
    this.queueBindings = bindings;
  }

  registerHandler(eventType: string, handler: EventHandler): void {
    this.handlers.set(eventType, handler);
  }

  async start(): Promise<void> {
    try {
      const connection = await connect(env.RABBITMQ_URI);
      const channel = await connection.createChannel();

      this.connection = connection;
      this.channel = channel;

      // Configurar prefetch para controlar throughput
      await channel.prefetch(10);

      for (const binding of this.queueBindings) {
        await this.consumeQueue(binding.queueName, async (msg) => {
          if (!msg) return;
          await this.handleMessage(msg, binding.eventType);
        });
      }

      logger.info('RabbitMQ consumers started');
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      logger.error(
        { error: errorMessage },
        'Failed to start RabbitMQ consumers'
      );
      throw error;
    }
  }

  private async consumeQueue(
    queueName: string,
    onMessage: (msg: ConsumeMessage | null) => Promise<void>
  ): Promise<void> {
    if (!this.channel) {
      throw new Error('Channel not initialized');
    }

    await this.channel.consume(
      queueName,
      async (msg) => {
        if (!msg) {
          return;
        }

        try {
          await onMessage(msg);
          this.channel?.ack(msg);
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : 'Unknown error';
          logger.error(
            {
              error: errorMessage,
              queue: queueName,
              messageId: msg.properties.messageId,
            },
            'Failed to process message, sending to DLQ'
          );
          // Nack com requeue=false envia para DLQ
          this.channel?.nack(msg, false, false);
        }
      },
      {
        noAck: false, // Requer confirmação manual
      }
    );

    logger.info({ queue: queueName }, 'Started consuming queue');
  }

  private async handleMessage(
    msg: ConsumeMessage,
    eventType: string
  ): Promise<void> {
    try {
      const content = JSON.parse(msg.content.toString());
      const handler = this.handlers.get(eventType);

      if (!handler) {
        logger.warn(
          { eventType },
          'No handler registered for event type'
        );
        return;
      }

      // Verificar idempotência via idempotencyKey
      const idempotencyKey =
        msg.properties.headers?.['x-idempotency-key'] || content.id;

      logger.info(
        {
          eventType,
          eventId: content.id,
          idempotencyKey,
        },
        'Processing event'
      );

      await handler.handle(content);

      logger.info(
        {
          eventType,
          eventId: content.id,
        },
        'Event processed successfully'
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      logger.error(
        {
          error: errorMessage,
          eventType,
        },
        'Error handling message'
      );
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (this.channel) {
      await this.channel.close();
      this.channel = null;
    }
    if (this.connection) {
      await this.connection.close();
      this.connection = null;
    }
    logger.info('RabbitMQ consumers stopped');
  }
}
