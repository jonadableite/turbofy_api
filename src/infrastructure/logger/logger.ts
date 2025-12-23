import path from "path";
import pino from "pino";
import { LogData, Logger } from "./types";

type LogArgs<T> = [LogData<T>] | [Partial<LogData<T>>, string] | [string];

const SERVICE_NAME = "turbofy-api";
const PROJECT_ROOT = path.join(process.cwd(), "turbofy_api");
const isProduction = process.env.NODE_ENV === "production";

// #region agent log helper
// Debug instrumentation to observe logger normalization/formatting at runtime.
// NOTE: Keep during debugging; remove only after verification succeeds.
const emitDebugLog = (payload: {
  runId: string;
  hypothesisId: string;
  location: string;
  message: string;
  data?: Record<string, unknown>;
}) => {
  void fetch("http://127.0.0.1:7244/ingest/a7d971f7-0d31-4e99-b828-51579f94216a", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId: "debug-session",
      timestamp: Date.now(),
      ...payload,
    }),
  }).catch(() => {
    // swallow instrumentation errors
  });
};
// #endregion

const transport = isProduction
  ? undefined
  : {
      target: "pino-pretty",
      options: {
        colorize: true,
        translateTime: "SYS:HH:MM:ss",
        ignore: "pid,hostname",
        messageFormat: "{file} {type} {msg}",
        customColors: "info:blue,warn:yellow,error:red,debug:magenta",
        levelFirst: true,
      },
    };

const pinoLogger = pino({
  level: process.env.LOG_LEVEL ?? (isProduction ? "info" : "debug"),
  base: {
    service: SERVICE_NAME,
  },
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  transport,
});

const resolveCallerFile = (): string | undefined => {
  // Avoid stack parsing overhead in production hot paths
  if (isProduction) {
    return undefined;
  }

  const stack = new Error().stack?.split("\n").slice(3);
  if (!stack) return undefined;

  for (const line of stack) {
    const match = line.match(/\((.*):\d+:\d+\)/) ?? line.match(/at (.*):\d+:\d+/);
    const filePath = match?.[1];
    if (filePath && filePath.includes("turbofy_api")) {
      const relative = path.relative(PROJECT_ROOT, filePath);
      if (!relative.startsWith("node_modules")) {
        return relative.replace(/\\/g, "/");
      }
    }
  }

  return undefined;
};

const normalizeLogInput = <T>(args: LogArgs<T>): LogData<T> => {
  if (typeof args[0] === "string") {
    // #region agent log
    emitDebugLog({
      runId: "pre-fix",
      hypothesisId: "H1",
      location: "logger.ts:normalizeLogInput:string",
      message: "normalizeLogInput received string message",
      data: { hasSecondArg: args.length === 2 },
    });
    // #endregion
    return { type: "GENERAL", message: args[0] };
  }

  if (args.length === 2 && typeof args[1] === "string") {
    const [partial, message] = args;
    // #region agent log
    emitDebugLog({
      runId: "pre-fix",
      hypothesisId: "H1",
      location: "logger.ts:normalizeLogInput:partial",
      message: "normalizeLogInput received partial + message",
      data: {
        partialKeys: Object.keys(partial ?? {}),
        hasPayload: Boolean((partial as LogData<T>).payload),
      },
    });
    // #endregion
    return {
      type: partial.type ?? "HTTP_LOG",
      message: message ?? partial.message ?? "Log",
      payload: partial.payload as T | undefined,
      error: partial.error,
      file: partial.file,
    };
  }

  const raw = args[0] as LogData<T>;
  return {
    type: raw.type ?? "GENERAL",
    message: raw.message ?? "Log",
    payload: raw.payload,
    error: raw.error,
    file: raw.file,
    ...raw,
  };
};

const formatLogData = <T>({ message, error, type, payload, file }: LogData<T>) => {
  const resolvedFile = file ?? resolveCallerFile();
  const resolvedType = type ?? "GENERAL";
  
  // Format message with file and type prefix for better readability
  const formattedFile = resolvedFile ? `[${resolvedFile}]` : "";
  const formattedType = `[${resolvedType}]`;
  
  return {
    msg: message,
    type: formattedType,
    file: formattedFile,
    payload,
    err: error,
  };
};

const logWithLevel = <T>(level: "debug" | "info" | "warn" | "error", ...args: LogArgs<T>) => {
  // Normalize arguments to structured log
  const structured = normalizeLogInput<T>(args);
  // #region agent log
  emitDebugLog({
    runId: "pre-fix",
    hypothesisId: "H1",
    location: "logger.ts:logWithLevel",
    message: "logWithLevel structured log",
    data: {
      level,
      type: structured.type,
      hasPayload: Boolean(structured.payload),
      hasError: Boolean(structured.error),
    },
  });
  // #endregion
  const formatted = formatLogData(structured);
  (pinoLogger as pino.Logger)[level](formatted);
};

const AppLogger: Logger = {
  debug: <T>(...args: LogArgs<T>) => logWithLevel<T>("debug", ...args),
  info: <T>(...args: LogArgs<T>) => logWithLevel<T>("info", ...args),
  warn: <T>(...args: LogArgs<T>) => logWithLevel<T>("warn", ...args),
  error: <T>(...args: LogArgs<T>) => logWithLevel<T>("error", ...args),
};

export default (): Logger => AppLogger;
export { pinoLogger };

