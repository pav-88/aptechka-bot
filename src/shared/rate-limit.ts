import type { BotContext } from './types';
import { logger } from './logger';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<number, RateLimitEntry>();
const MAX_REQUESTS = 20;
const WINDOW_MS = 60_000;

export function rateLimit(ctx: BotContext): boolean {
  const userId = ctx.from?.id;
  if (!userId) return true;

  const now = Date.now();
  const entry = store.get(userId);

  if (!entry || now > entry.resetAt) {
    store.set(userId, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }

  entry.count++;

  if (entry.count > MAX_REQUESTS) {
    logger.warn('RateLimit', `Exceeded for user ${userId}`, { count: entry.count });
    return false;
  }

  return true;
}

export function clearRateLimit(userId: number): void {
  store.delete(userId);
}

export function startRateLimitCleanup(intervalMs = 300_000): void {
  setInterval(() => {
    const now = Date.now();
    let cleaned = 0;
    for (const [userId, entry] of store) {
      if (now > entry.resetAt) {
        store.delete(userId);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      logger.info('RateLimit', `Cleaned ${cleaned} expired entries`, { remaining: store.size });
    }
  }, intervalMs);
}

export const RATE_LIMIT_MESSAGE = '⚠️ Слишком много запросов. Пожалуйста, подождите минуту.';