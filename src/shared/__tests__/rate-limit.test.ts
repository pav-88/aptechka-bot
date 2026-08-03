import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('rate-limit', () => {
  let rateLimit: (ctx: { from?: { id: number } }) => boolean;
  let clearRateLimit: (userId: number) => void;
  let RATE_LIMIT_MESSAGE: string;

  function createMockContext(userId: number) {
    return { from: { id: userId, is_bot: false, first_name: 'test' } };
  }

  beforeEach(async () => {
    vi.stubEnv('BOT_TOKEN', 'test:token');
    const mod = await import('../rate-limit');
    rateLimit = mod.rateLimit as (ctx: { from?: { id: number } }) => boolean;
    clearRateLimit = mod.clearRateLimit;
    RATE_LIMIT_MESSAGE = mod.RATE_LIMIT_MESSAGE;
  });

  it('should allow first request', () => {
    expect(rateLimit(createMockContext(1))).toBe(true);
  });

  it('should allow up to 20 requests per window', () => {
    const ctx = createMockContext(2);
    for (let i = 0; i < 20; i++) {
      expect(rateLimit(ctx)).toBe(true);
    }
  });

  it('should block the 21st request in the same window', () => {
    const ctx = createMockContext(3);
    for (let i = 0; i < 20; i++) {
      rateLimit(ctx);
    }
    expect(rateLimit(ctx)).toBe(false);
  });

  it('should allow requests again after clearRateLimit', () => {
    const ctx = createMockContext(4);
    for (let i = 0; i < 20; i++) {
      rateLimit(ctx);
    }
    expect(rateLimit(ctx)).toBe(false);

    clearRateLimit(4);
    expect(rateLimit(ctx)).toBe(true);
  });

  it('should handle different users independently', () => {
    const ctxA = createMockContext(5);
    const ctxB = createMockContext(6);

    for (let i = 0; i < 20; i++) {
      rateLimit(ctxA);
    }
    expect(rateLimit(ctxA)).toBe(false);
    expect(rateLimit(ctxB)).toBe(true);
  });

  it('should return true when ctx.from is undefined', () => {
    expect(rateLimit({})).toBe(true);
  });

  it('should export rate limit message', () => {
    expect(RATE_LIMIT_MESSAGE).toBeTruthy();
    expect(typeof RATE_LIMIT_MESSAGE).toBe('string');
  });
});