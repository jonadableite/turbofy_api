import path from "path";
import pino from "pino";
import { LogData, Logger } from "./types";

type LogArgs<T> = [LogData<T>] | [Partial<LogData<T>>, string] | [string];

const SERVICE_NAME = "turbofy-api";
const PROJECT_ROOT = path.join(process.cwd(), "turbofy_api");
const isProduction = process.env.NODE_ENV === "production";

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
    return { type: "GENERAL", message: args[0] };
  }

  if (args.length === 2 && typeof args[1] === "string") {
    const [partial, message] = args;
    return {
      type: partial.type ?? "HTTP_LOG",
      message,
      payload: partial.payload as T | undefined,
      error: partial.error,
      file: partial.file,
    };
  }

  return args[0] as LogData<T>;
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

