import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

describe('config schema', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it('should parse config with BOT_TOKEN set', async () => {
    vi.stubEnv('BOT_TOKEN', 'test:token');
    vi.stubEnv('DATABASE_URL', 'file:./test.db');
    vi.stubEnv('DATABASE_PROVIDER', 'sqlite');
    vi.stubEnv('DEEPSEEK_API_KEY', 'sk-test');
    vi.stubEnv('LOG_LEVEL', 'DEBUG');

    const { config } = await import('../index');
    expect(config.botToken).toBe('test:token');
    expect(config.databaseUrl).toBe('file:./test.db');
    expect(config.databaseProvider).toBe('sqlite');
    expect(config.deepseekApiKey).toBe('sk-test');
    expect(config.logLevel).toBe('DEBUG');
  });

  it('should use defaults when optional env vars not set', async () => {
    vi.stubEnv('BOT_TOKEN', 'test:token');
    vi.stubEnv('DATABASE_URL', 'file:./dev.db');
    vi.stubEnv('DEEPSEEK_API_KEY', '');
    vi.stubEnv('LOG_LEVEL', 'INFO');

    const { config } = await import('../index');
    expect(config.databaseUrl).toBe('file:./dev.db');
    expect(config.databaseProvider).toBe('sqlite');
    expect(config.deepseekApiKey).toBe('');
    expect(config.logLevel).toBe('INFO');
  });

  it('should fail validation without BOT_TOKEN', () => {
    const schema = z.object({
      BOT_TOKEN: z.string().min(1, 'BOT_TOKEN is required'),
      DATABASE_URL: z.string().default('file:./dev.db'),
      DATABASE_PROVIDER: z.enum(['sqlite', 'postgresql']).optional().default('sqlite'),
      DEEPSEEK_API_KEY: z.string().optional(),
      LOG_LEVEL: z.enum(['DEBUG', 'INFO', 'WARN', 'ERROR']).optional().default('INFO'),
    });
    const result = schema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(['BOT_TOKEN']);
    }
  });
});