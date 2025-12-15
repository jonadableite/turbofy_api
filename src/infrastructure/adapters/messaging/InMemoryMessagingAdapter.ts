import pino from "pino";
import { MessagingPort, OutboundEvent } from "../../../ports/MessagingPort";

const logger = pino({ name: "InMemoryMessagingAdapter" });

export class InMemoryMessagingAdapter implements MessagingPort {
  async publish(event: OutboundEvent): Promise<void> {
    logger.info({ event }, "Published event (in-memory)");
  }
}