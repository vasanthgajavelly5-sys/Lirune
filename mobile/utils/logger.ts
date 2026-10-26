/**
 * Lirune Reader Mobile — Lightweight, Privacy-Preserving Logger
 * Strictly avoids logging sensitive book titles, local file paths, or personal reading history.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// Production builds default to error only, ensuring user reading habits and file structures
// are never broadcast into Android system logcat.
const isDev = typeof __DEV__ !== 'undefined' ? Boolean(__DEV__) : (typeof process !== 'undefined' && process.env.NODE_ENV !== 'production');
let currentLogLevel: LogLevel = isDev ? 'debug' : 'error';

const LOG_BUFFER: string[] = [];
const MAX_LOG_BUFFER = 200;

const PATH_OR_URI_PATTERN = /(?:\/data\/user\/\d+\/[^\s"']+|\/storage\/emulated\/\d+\/[^\s"']+|content:\/\/[^\s"']+|file:\/\/[^\s"']+|[A-Za-z]:\\[^\s"']+)/g;

/**
 * Redacts absolute system filesystem paths, content URIs, and user directories
 * so errors reported in production do not reveal private filesystem structures.
 */
export function redactSensitive(input: string): string {
  if (typeof input !== 'string') return String(input);
  return input.replace(PATH_OR_URI_PATTERN, '[REDACTED_PATH]');
}

function pushToBuffer(line: string) {
  LOG_BUFFER.push(line);
  if (LOG_BUFFER.length > MAX_LOG_BUFFER) {
    LOG_BUFFER.shift();
  }
}

function formatMessage(level: LogLevel, tag: string, message: string): string {
  const timestamp = new Date().toISOString();
  const safeMessage = isDev ? message : redactSensitive(message);
  return `[${timestamp}] [${level.toUpperCase()}] [${tag}] ${safeMessage}`;
}

export const logger = {
  getLogLevel(): LogLevel {
    return currentLogLevel;
  },

  setLogLevel(level: LogLevel) {
    currentLogLevel = level;
  },

  getLogBuffer(): string[] {
    return [...LOG_BUFFER];
  },

  clearLogBuffer() {
    LOG_BUFFER.length = 0;
  },

  debug(tag: string, message: string, ...args: unknown[]) {
    const formatted = formatMessage('debug', tag, message);
    pushToBuffer(formatted);
    if (LOG_LEVELS.debug >= LOG_LEVELS[currentLogLevel]) {
      console.log(formatted, ...args);
    }
  },

  info(tag: string, message: string, ...args: unknown[]) {
    const formatted = formatMessage('info', tag, message);
    pushToBuffer(formatted);
    if (LOG_LEVELS.info >= LOG_LEVELS[currentLogLevel]) {
      console.info(formatted, ...args);
    }
  },

  warn(tag: string, message: string, ...args: unknown[]) {
    const formatted = formatMessage('warn', tag, message);
    pushToBuffer(formatted);
    if (LOG_LEVELS.warn >= LOG_LEVELS[currentLogLevel]) {
      console.warn(formatted, ...args);
    }
  },

  error(tag: string, message: string, error?: unknown, ...args: unknown[]) {
    const errStr = error ? ` | Error: ${redactSensitive(String(error))}` : '';
    const formatted = formatMessage('error', tag, message) + errStr;
    pushToBuffer(formatted);
    if (LOG_LEVELS.error >= LOG_LEVELS[currentLogLevel]) {
      console.error(formatted, error ?? '', ...args);
    }
  },
};
