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

const initialSessionData: SessionData = {
  awaitingInput: undefined,
  tempData: undefined,
  familyMemberId: undefined,
};

export async function createBot(): Promise<Bot<BotContext>> {
  await connectDatabase();

  const bot = new Bot<BotContext>(config.botToken);

  bot.use(session({ initial: () => ({ ...initialSessionData }) }));

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
    console.error('Bot error:', err);
  });

  return bot;
}

export async function startBot(): Promise<void> {
  try {
    const bot = await createBot();
    await bot.start({
      onStart: ({ username }) => {
        console.log(`Bot @${username} is running...`);
      },
    });
  } catch (error) {
    console.error('Failed to start bot:', error);
    await disconnectDatabase();
    process.exit(1);
  }
}

process.once('SIGINT', async () => {
  await disconnectDatabase();
  process.exit(0);
});

process.once('SIGTERM', async () => {
  await disconnectDatabase();
  process.exit(0);
});