import { BankingPort } from "../../../ports/BankingPort";
import { env } from "../../../config/env";
import { logger } from "../../logger";
import { StubBankingAdapter } from "./StubBankingAdapter";
import { TransfeeraBankingAdapter } from "./TransfeeraBankingAdapter";

export class BankingFactory {
  static create(): BankingPort {
    if (env.TRANSFEERA_ENABLED) {
      logger.info("Using TransfeeraBankingAdapter");
      return new TransfeeraBankingAdapter();
    }

    logger.info("Using StubBankingAdapter");
    return new StubBankingAdapter();
  }
}

