/**
 * Lirune Reader Mobile — Lightweight Performance Instrumentation
 * Enabled strictly in development and debug builds.
 * Routes metrics through the privacy-preserving redacting logger.
 */

import { logger } from './logger.ts';

const isDev = typeof __DEV__ !== 'undefined' 
  ? Boolean(__DEV__) 
  : (typeof process !== 'undefined' && process.env.NODE_ENV !== 'production');

const marks = new Map<string, number>();

export const perf = {
  isEnabled(): boolean {
    return isDev;
  },

  now(): number {
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
      return performance.now();
    }
    return Date.now();
  },

  mark(name: string): void {
    if (!isDev) return;
    marks.set(name, this.now());
  },

  measure(name: string, startMark?: string): number {
    if (!isDev) return 0;
    const end = this.now();
    const start = startMark ? marks.get(startMark) : marks.get(name);
    if (start === undefined) return 0;
    const duration = end - start;
    logger.debug('Perf', `${name}: ${duration.toFixed(2)}ms`);
    return duration;
  },

  clear(name?: string): void {
    if (name) {
      marks.delete(name);
    } else {
      marks.clear();
    }
  }
};
