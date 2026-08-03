import { Bot, session, ApiClientOptions } from 'grammy';
import type { BotContext, SessionData } from '../shared/types';
import { config } from '../config';
import { connectDatabase, disconnectDatabase } from '../shared/database';
import { mainKeyboard } from '../shared/keyboard';
import { rateLimit, RATE_LIMIT_MESSAGE, startRateLimitCleanup } from '../shared/rate-limit';
import { validateConfig } from '../shared/security';
import { prisma } from '../shared/database';
import { startReminderChecker } from '../shared/reminder-checker';
import { prismaSessionAdapter } from '../shared/session-adapter';
import { logger } from '../shared/logger';

import { medicinesComposer } from '../features/medicines';
import { mykitComposer } from '../features/mykit';
import { firstaidComposer } from '../features/firstaid';
import { remindersComposer } from '../features/reminders';
import { reportsComposer } from '../features/reports';
import { photoComposer } from '../features/photo';
import { familyComposer } from '../features/family';
import { prescriptionsComposer } from '../features/prescriptions';
import { addMedicineComposer } from '../features/photo/add-medicine-handler';

import { handleAwaitingInput } from '../features/awaiting-input';

const initialSessionData: SessionData = {
  awaitingInput: undefined,
  tempData: undefined,
  familyMemberId: undefined,
};

async function startHandler(ctx: BotContext): Promise<void> {
  const telegramId = String(ctx.from?.id);
  const firstName = ctx.from?.first_name;
  const lastName = ctx.from?.last_name;
  const username = ctx.from?.username;

  const user = await prisma.user.upsert({
    where: { telegramId },
    update: { firstName, lastName, username },
    create: { telegramId, firstName, lastName, username },
  });

  const familyCount = await prisma.familyMember.count({ where: { userId: user.id } });

  let greeting = `👋 Привет, *${firstName || 'друг'}*! Добро пожаловать в *Аптечку*!\n\n`;
  greeting += 'Я помогу тебе управлять домашней аптечкой:\n\n';
  greeting += '💊 *Справочник лекарств* — поиск по названию\n';
  greeting += '📦 *Моя аптечка* — список всех лекарств\n';
  greeting += '📷 *Добавить лекарство* — фото или текст\n';
  greeting += '🩺 *Назначение врача* — сверка с аптечкой\n';
  greeting += '⏰ *Напоминания* — контроль сроков и остатков\n';
  greeting += '📊 *Отчёт* — сводка по аптечке\n';
  greeting += '🏥 *Первая помощь* — что есть по категориям\n';
  greeting += '👨‍👩‍👧‍👧 *Семья* — профили для каждого\n';

  if (familyCount === 0) {
    greeting += '\n\n⚠️ *Совет:* Настройте семью через "👨‍👩‍👧‍👧 Семья", чтобы бот знал, для кого назначения.';
  }

  await ctx.reply(greeting, { parse_mode: 'Markdown', reply_markup: mainKeyboard });
}

export async function createBot(): Promise<Bot<BotContext>> {
  const validation = validateConfig();
  if (!validation.valid) {
    logger.error('Bot', 'Configuration validation failed', { errors: validation.errors });
    throw new Error(`Config validation failed: ${validation.errors.join('; ')}`);
  }
  for (const w of validation.warnings) {
    logger.warn('Bot', w);
  }

  await connectDatabase();

  const bot = new Bot<BotContext>(config.botToken);

  bot.use(session({
    initial: () => ({ ...initialSessionData }),
    storage: prismaSessionAdapter<SessionData>(),
  }));

  startRateLimitCleanup();

  bot.use(async (ctx, next) => {
    if (!rateLimit(ctx)) {
      await ctx.reply(RATE_LIMIT_MESSAGE);
      return;
    }
    await next();
  });

  bot.command('start', startHandler);

  bot.use(medicinesComposer);
  bot.use(mykitComposer);
  bot.use(firstaidComposer);
  bot.use(remindersComposer);
  bot.use(reportsComposer);
  bot.use(photoComposer);
  bot.use(familyComposer);
  bot.use(prescriptionsComposer);
  bot.use(addMedicineComposer);

  bot.on('message:text', handleAwaitingInput);

  startReminderChecker(bot);

  bot.catch((err) => {
    logger.error('Bot', 'Unhandled error', { message: err.message, stack: err.stack });
    if (err.ctx) {
      err.ctx.reply('❌ Произошла внутренняя ошибка. Попробуйте ещё раз.').catch(() => {});
    }
  });

  return bot;
}

async function checkTelegramApi(): Promise<void> {
  const url = `https://api.telegram.org/bot${config.botToken}/getMe`;
  logger.info('Bot', 'Checking Telegram API connectivity...');

  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(id);
    const text = await res.text();
    logger.info('Bot', `Telegram API connectivity check: ${res.status} ${res.statusText}`, { body: text.substring(0, 200) });
  } catch (err) {
    clearTimeout(id);
    logger.error('Bot', 'Telegram API is NOT reachable', { error: err instanceof Error ? err.message : String(err) });
  }
}

export async function startBot(): Promise<void> {
  try {
    const bot = await createBot();

    await checkTelegramApi();

    logger.info('Bot', 'Calling bot.start() — connecting to Telegram API...');

    bot.start({
      onStart: ({ username }) => {
        logger.info('Bot', `Bot @${username} is running`, { mode: 'polling', rateLimit: '20 req/min per user', session: 'persistent (Prisma)' });
      },
    });

    logger.info('Bot', 'bot.start() returned without throwing — bot is running in background');
  } catch (error) {
    const msg = error instanceof Error ? `${error.name}: ${error.message}\n${error.stack}` : String(error);
    console.error('FATAL:', msg);
    logger.error('Bot', 'Failed to start bot', { error: String(error) });
    await disconnectDatabase();
    process.exit(1);
  }
}

process.once('SIGINT', async () => {
  logger.info('Bot', 'Shutting down (SIGINT)');
  await disconnectDatabase();
  process.exit(0);
});

process.once('SIGTERM', async () => {
  logger.info('Bot', 'Shutting down (SIGTERM)');
  await disconnectDatabase();
  process.exit(0);
});