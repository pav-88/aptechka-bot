import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('security', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it('validateConfig should return warning when no DeepSeek key', async () => {
    vi.stubEnv('BOT_TOKEN', 'test:token');
    vi.stubEnv('DEEPSEEK_API_KEY', '');

    const { validateConfig } = await import('../security');
    const result = validateConfig();
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain('DEEPSEEK_API_KEY');
  });

  it('validateConfig should return warning with placeholder key', async () => {
    vi.stubEnv('BOT_TOKEN', 'test:token');
    vi.stubEnv('DEEPSEEK_API_KEY', 'ваш_ключ_здесь');

    const { validateConfig } = await import('../security');
    const result = validateConfig();
    expect(result.valid).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain('placeholder');
  });

  it('validateConfig should return no warnings with valid key', async () => {
    vi.stubEnv('BOT_TOKEN', 'test:token');
    vi.stubEnv('DEEPSEEK_API_KEY', 'sk-real-key');

    const { validateConfig } = await import('../security');
    const result = validateConfig();
    expect(result.valid).toBe(true);
    expect(result.warnings).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it('validateDeepSeekToken should return false without key', async () => {
    vi.stubEnv('BOT_TOKEN', 'test:token');
    vi.stubEnv('DEEPSEEK_API_KEY', '');

    const { validateDeepSeekToken } = await import('../security');
    const result = await validateDeepSeekToken();
    expect(result).toBe(false);
  });
});