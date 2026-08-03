import cron from 'node-cron';
import { Bot } from 'grammy';
import type { BotContext } from './types';
import { prisma } from './database';

export function startReminderChecker(bot: Bot<BotContext>): void {
  cron.schedule('0 9 * * *', async () => {
    console.log('Running daily reminder check...');
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
      try {
        await bot.api.sendMessage(
          parseInt(um.user.telegramId, 10),
          `⚠️ *Внимание!*\n\n`
          + `У лекарства *${um.medicine.name}* скоро истекает срок годности!\n`
          + `📅 Срок до: ${um.expiryDate?.toLocaleDateString('ru-RU')}\n`
          + `Осталось: ${um.quantity} шт.\n\n`
          + `Продолжать напоминать?`,
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '✅ Да', callback_data: `remind_keep:${um.id}` },
                  { text: '❌ Нет', callback_data: `remind_stop:${um.id}` },
                ],
              ],
            },
          },
        );
      } catch (err) {
        console.error(`Failed to send reminder for medicine ${um.medicine.name}:`, err);
      }
    }

    const lowStock = await prisma.userMedicine.findMany({
      where: {
        quantity: { lte: 3, gt: 0 },
      },
      include: {
        user: true,
        medicine: true,
      },
    });

    for (const um of lowStock) {
      try {
        if (um.expiryDate && um.expiryDate < now) continue;

        await bot.api.sendMessage(
          parseInt(um.user.telegramId, 10),
          `📦 *Заканчивается!*\n\n`
          + `Лекарства *${um.medicine.name}* осталось всего ${um.quantity} шт.\n`
          + `Рекомендуем пополнить запас.\n\n`
          + `Напоминать дальше?`,
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '✅ Да', callback_data: `remind_keep:${um.id}` },
                  { text: '❌ Нет', callback_data: `remind_stop:${um.id}` },
                ],
              ],
            },
          },
        );
      } catch (err) {
        console.error(`Failed to send low stock alert for ${um.medicine.name}:`, err);
      }
    }
  });
}