import { Bot, session } from 'grammy';
import type { BotContext, SessionData } from '../shared/types';
import { config } from '../config';
import { connectDatabase, disconnectDatabase } from '../shared/database';
import { startHandler } from './start';
import { registerMedicineHandlers } from '../features/medicines/handlers';
import { registerReminderHandlers } from '../features/reminders/handlers';
import { registerMyKitHandlers } from '../features/mykit/handlers';
import { registerSymptomHandlers } from '../features/symptoms/handlers';
import { registerPhotoHandlers } from '../features/photo/handlers';
import { registerPrescriptionHandlers } from '../features/prescriptions/handlers';
import { registerFamilyHandlers } from '../features/family/handlers';
import { registerAnalyticsHandlers } from '../features/analytics/handlers';
import { registerFirstAidHandlers } from '../features/firstaid/handlers';
import { startReminderChecker } from '../shared/reminder-checker';
import { rateLimit, RATE_LIMIT_MESSAGE } from '../shared/rate-limit';
import { validateConfig } from '../shared/security';

const initialSessionData: SessionData = {
  awaitingInput: undefined,
  tempData: undefined,
  familyMemberId: undefined,
};

export async function createBot(): Promise<Bot<BotContext>> {
  const validation = validateConfig();
  if (!validation.valid) {
    console.error('[SECURITY] Configuration validation failed:');
    validation.errors.forEach((e) => console.error(`  ❌ ${e}`));
    throw new Error(`Config validation failed: ${validation.errors.join('; ')}`);
  }
  if (validation.warnings.length > 0) {
    validation.warnings.forEach((w) => console.warn(`  ⚠️ ${w}`));
  }

  await connectDatabase();

  const bot = new Bot<BotContext>(config.botToken);

  bot.use(session({ initial: () => ({ ...initialSessionData }) }));

  bot.use(async (ctx, next) => {
    if (!rateLimit(ctx)) {
      await ctx.reply(RATE_LIMIT_MESSAGE);
      const userId = ctx.from?.id;
      console.warn(`[SECURITY] Rate limit hit: user ${userId || 'unknown'}, chat ${ctx.chat?.id || 'unknown'}`);
      return;
    }
    await next();
  });

  bot.command('start', startHandler);

  registerFamilyHandlers(bot);
  registerMedicineHandlers(bot);
  registerMyKitHandlers(bot);
  registerPrescriptionHandlers(bot);
  registerReminderHandlers(bot);
  registerSymptomHandlers(bot);
  registerPhotoHandlers(bot);
  registerAnalyticsHandlers(bot);
  registerFirstAidHandlers(bot);

  startReminderChecker(bot);

  bot.catch((err) => {
    console.error('[BOT] Unhandled error:', err);
  });

  return bot;
}

export async function startBot(): Promise<void> {
  try {
    const bot = await createBot();
    await bot.start({
      onStart: ({ username }) => {
        console.log(`[APTHECKA] Bot @${username} is running...`);
        console.log('[APTHECKA] Security: rate limiter active (20 req/min per user)');
      },
    });
  } catch (error) {
    console.error('[APTHECKA] Failed to start bot:', error);
    await disconnectDatabase();
    process.exit(1);
  }
}

process.once('SIGINT', async () => {
  console.log('[APTHECKA] Shutting down...');
  await disconnectDatabase();
  process.exit(0);
});

process.once('SIGTERM', async () => {
  console.log('[APTHECKA] Shutting down...');
  await disconnectDatabase();
  process.exit(0);
});