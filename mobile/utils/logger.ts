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
const CURRENT_LOG_LEVEL: LogLevel = __DEV__ ? 'debug' : 'info';

function formatMessage(level: LogLevel, tag: string, message: string): string {
  const timestamp = new Date().toISOString();
  return `[${timestamp}] [${level.toUpperCase()}] [${tag}] ${message}`;
}

export const logger = {
  debug(tag: string, message: string, ...args: unknown[]) {
    if (LOG_LEVELS.debug >= LOG_LEVELS[CURRENT_LOG_LEVEL]) {
      console.log(formatMessage('debug', tag, message), ...args);
    }
  },

  info(tag: string, message: string, ...args: unknown[]) {
    if (LOG_LEVELS.info >= LOG_LEVELS[CURRENT_LOG_LEVEL]) {
      console.info(formatMessage('info', tag, message), ...args);
    }
  },

  warn(tag: string, message: string, ...args: unknown[]) {
    if (LOG_LEVELS.warn >= LOG_LEVELS[CURRENT_LOG_LEVEL]) {
      console.warn(formatMessage('warn', tag, message), ...args);
    }
  },

  error(tag: string, message: string, error?: unknown, ...args: unknown[]) {
    if (LOG_LEVELS.error >= LOG_LEVELS[CURRENT_LOG_LEVEL]) {
      console.error(formatMessage('error', tag, message), error ?? '', ...args);
    }
  },
};
