export interface LogData<T> {
  type: string;
  message: string;
  payload?: T;
  error?: unknown;
  file?: string;
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