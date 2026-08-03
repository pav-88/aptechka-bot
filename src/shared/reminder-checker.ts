import cron from 'node-cron';
import { Bot } from 'grammy';
import type { BotContext } from './types';
import { prisma } from './database';
import { logger } from './logger';

async function sendToAllLinked(
  bot: Bot<BotContext>,
  telegramId: string,
  message: string,
  replyMarkup?: Record<string, unknown>,
): Promise<void> {
  const sent = new Set<string>();
  await sendToUser(bot, telegramId, message, replyMarkup, sent);

  const linkedAccounts = await prisma.familyMemberLinkedAccount.findMany({
    where: { telegramId },
    include: { familyMember: { include: { linkedAccounts: true } } },
  });

  for (const account of linkedAccounts) {
    for (const linked of account.familyMember.linkedAccounts) {
      await sendToUser(bot, linked.telegramId, message, replyMarkup, sent);
    }
  }
}

async function sendToUser(
  bot: Bot<BotContext>,
  telegramId: string,
  message: string,
  replyMarkup?: Record<string, unknown>,
  sent?: Set<string>,
): Promise<void> {
  if (sent?.has(telegramId)) return;
  sent?.add(telegramId);

  try {
    await bot.api.sendMessage(parseInt(telegramId, 10), message, {
      parse_mode: 'Markdown',
      reply_markup: replyMarkup as never,
    });
  } catch (err) {
    logger.error('Reminder', `Failed to send to user ${telegramId}`, { error: String(err) });
  }
}

async function cleanupExpiredInviteCodes(): Promise<void> {
  try {
    const result = await prisma.inviteCode.deleteMany({
      where: {
        usedAt: null,
        expiresAt: { lt: new Date() },
      },
    });
    if (result.count > 0) {
      logger.info('Reminder', `Cleaned up ${result.count} expired invite codes`);
    }
  } catch (err) {
    logger.error('Reminder', 'Failed to cleanup expired invite codes', { error: String(err) });
  }
}

export function startReminderChecker(bot: Bot<BotContext>): void {
  cron.schedule('0 9 * * *', async () => {
    logger.info('Reminder', 'Running daily check');

    const now = new Date();
    const threeDays = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

    const expiringMedicines = await prisma.userMedicine.findMany({
      where: {
        expiryDate: {
          not: null,
          lte: threeDays,
          gt: now,
        },
      },
      include: {
        user: true,
        medicine: true,
      },
    });

    for (const um of expiringMedicines) {
      const message =
        `⚠️ *Внимание!*\n\n`
        + `У лекарства *${um.medicine.name}* скоро истекает срок годности!\n`
        + `📅 Срок до: ${um.expiryDate?.toLocaleDateString('ru-RU')}\n`
        + `Осталось: ${um.quantity} шт.\n\n`
        + `Продолжать напоминать?`;

      const replyMarkup = {
        inline_keyboard: [
          [
            { text: '✅ Да', callback_data: `remind_keep:${um.id}` },
            { text: '❌ Нет', callback_data: `remind_stop:${um.id}` },
          ],
        ],
      };

      await sendToAllLinked(bot, um.user.telegramId, message, replyMarkup);
    }

    const lowStock = await prisma.userMedicine.findMany({
      where: { quantity: { lte: 3, gt: 0 } },
      include: { user: true, medicine: true },
    });

    for (const um of lowStock) {
      if (um.expiryDate && um.expiryDate < now) continue;

      const message =
        `📦 *Заканчивается!*\n\n`
        + `Лекарства *${um.medicine.name}* осталось всего ${um.quantity} шт.\n`
        + `Рекомендуем пополнить запас.\n\n`
        + `Напоминать дальше?`;

      const replyMarkup = {
        inline_keyboard: [
          [
            { text: '✅ Да', callback_data: `remind_keep:${um.id}` },
            { text: '❌ Нет', callback_data: `remind_stop:${um.id}` },
          ],
        ],
      };

      await sendToAllLinked(bot, um.user.telegramId, message, replyMarkup);
    }

    await cleanupExpiredInviteCodes();
  });
}