import type { BotContext } from './types';

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
    console.warn(`[SECURITY] Rate limit exceeded for user ${userId} (${entry.count} requests)`);
    return false;
  }

  return true;
}

export function clearRateLimit(userId: number): void {
  store.delete(userId);
}

export const RATE_LIMIT_MESSAGE = '⚠️ Слишком много запросов. Пожалуйста, подождите минуту.';