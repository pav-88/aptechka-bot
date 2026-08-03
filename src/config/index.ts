import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  BOT_TOKEN: z.string().min(1, 'BOT_TOKEN is required'),
  DATABASE_URL: z.string().default('file:./dev.db'),
  DATABASE_PROVIDER: z.enum(['sqlite', 'postgresql']).optional().default('sqlite'),
  DEEPSEEK_API_KEY: z.string().optional(),
  LOG_LEVEL: z.enum(['DEBUG', 'INFO', 'WARN', 'ERROR']).optional().default('INFO'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('[CONFIG] Environment validation failed:');
  for (const issue of parsed.error.issues) {
    console.error(`  ❌ ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

export const config = {
  botToken: parsed.data.BOT_TOKEN,
  databaseUrl: parsed.data.DATABASE_URL,
  databaseProvider: parsed.data.DATABASE_PROVIDER,
  deepseekApiKey: parsed.data.DEEPSEEK_API_KEY || '',
  logLevel: parsed.data.LOG_LEVEL,
} as const;