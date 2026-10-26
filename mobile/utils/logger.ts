/**
 * Lirune Reader Mobile — Lightweight Logger
 * Does not log sensitive book contents or personal data.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// Default to info in production, debug in development
const isDev = typeof __DEV__ !== 'undefined' ? Boolean(__DEV__) : (typeof process !== 'undefined' && process.env.NODE_ENV !== 'production');
const CURRENT_LOG_LEVEL: LogLevel = isDev ? 'debug' : 'info';

const LOG_BUFFER: string[] = [];
const MAX_LOG_BUFFER = 200;

function pushToBuffer(line: string) {
  LOG_BUFFER.push(line);
  if (LOG_BUFFER.length > MAX_LOG_BUFFER) {
    LOG_BUFFER.shift();
  }
}

function formatMessage(level: LogLevel, tag: string, message: string): string {
  const timestamp = new Date().toISOString();
  return `[${timestamp}] [${level.toUpperCase()}] [${tag}] ${message}`;
}

export const logger = {
  getLogBuffer(): string[] {
    return [...LOG_BUFFER];
  },

  clearLogBuffer() {
    LOG_BUFFER.length = 0;
  },

  debug(tag: string, message: string, ...args: unknown[]) {
    const formatted = formatMessage('debug', tag, message);
    pushToBuffer(formatted);
    if (LOG_LEVELS.debug >= LOG_LEVELS[CURRENT_LOG_LEVEL]) {
      console.log(formatted, ...args);
    }
  },

  info(tag: string, message: string, ...args: unknown[]) {
    const formatted = formatMessage('info', tag, message);
    pushToBuffer(formatted);
    if (LOG_LEVELS.info >= LOG_LEVELS[CURRENT_LOG_LEVEL]) {
      console.info(formatted, ...args);
    }
  },

  warn(tag: string, message: string, ...args: unknown[]) {
    const formatted = formatMessage('warn', tag, message);
    pushToBuffer(formatted);
    if (LOG_LEVELS.warn >= LOG_LEVELS[CURRENT_LOG_LEVEL]) {
      console.warn(formatted, ...args);
    }
  },

  error(tag: string, message: string, error?: unknown, ...args: unknown[]) {
    const formatted = formatMessage('error', tag, message) + (error ? ` | Error: ${String(error)}` : '');
    pushToBuffer(formatted);
    if (LOG_LEVELS.error >= LOG_LEVELS[CURRENT_LOG_LEVEL]) {
      console.error(formatted, error ?? '', ...args);
    }
  },
};
