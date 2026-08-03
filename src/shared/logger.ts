export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

const currentLevel: LogLevel =
  (process.env.LOG_LEVEL as keyof typeof LogLevel) ?
    LogLevel[process.env.LOG_LEVEL as keyof typeof LogLevel] ?? LogLevel.INFO
    : LogLevel.INFO;

function timestamp(): string {
  return new Date().toISOString();
}

function log(level: LogLevel, levelName: string, namespace: string, message: string, meta?: unknown): void {
  if (level < currentLevel) return;
  const entry = { timestamp: timestamp(), level: levelName, namespace, message, meta };
  const output = JSON.stringify(entry);
  if (level === LogLevel.ERROR) {
    console.error(output);
  } else if (level === LogLevel.WARN) {
    console.warn(output);
  } else {
    console.log(output);
  }
}

export const logger = {
  debug: (namespace: string, message: string, meta?: unknown) => log(LogLevel.DEBUG, 'DEBUG', namespace, message, meta),
  info: (namespace: string, message: string, meta?: unknown) => log(LogLevel.INFO, 'INFO', namespace, message, meta),
  warn: (namespace: string, message: string, meta?: unknown) => log(LogLevel.WARN, 'WARN', namespace, message, meta),
  error: (namespace: string, message: string, meta?: unknown) => log(LogLevel.ERROR, 'ERROR', namespace, message, meta),
};