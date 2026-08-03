import dotenv from 'dotenv';
dotenv.config();

export const config = {
  botToken: process.env.BOT_TOKEN || '',
  databaseUrl: process.env.DATABASE_URL || 'file:./dev.db',
} as const;

if (!config.botToken) {
  throw new Error('BOT_TOKEN is not set in environment variables');
}