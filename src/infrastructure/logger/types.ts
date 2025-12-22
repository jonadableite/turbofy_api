export interface LogData<T> {
  type?: string;
  message?: string;
  payload?: T | Record<string, unknown>;
  error?: unknown;
  file?: string;
  // Permite campos contextuais adicionais sem quebrar chamadas existentes
  [key: string]: unknown;
}

export type LogMethod = {
  <T>(logData: LogData<T>): void;
  (message: string): void;
  <T>(payload: Partial<LogData<T>>, message: string): void;
};

export interface Logger {
  debug: LogMethod;
  info: LogMethod;
  warn: LogMethod;
  error: LogMethod;
}