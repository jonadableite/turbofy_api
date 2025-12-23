import makeLogger, { pinoLogger } from "./logger";

export { default as makeLogger } from "./logger";
export type { LogData, Logger, LogMethod } from "./types";
export { pinoLogger };
export const logger = makeLogger();

