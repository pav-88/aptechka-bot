import { Composer } from 'grammy';
import type { BotContext } from '../../shared/types';
import { prisma } from '../../shared/database';

export const reportsComposer = new Composer<BotContext>();

reportsComposer.hears('📊 Отчёт по аптечке', async (ctx) => {
  const telegramId = String(ctx.from?.id);
  const user = await prisma.user.findUnique({
    where: { telegramId },
    include: {
      medicines: { include: { medicine: true } },
      familyMembers: true,
    },
  });
  if (!user) return;

  const now = new Date();
  const threeMonths = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
  const total = user.medicines.length;
  const expired = user.medicines.filter((um) => um.expiryDate && um.expiryDate < now);
  const expiringSoon = user.medicines.filter((um) => um.expiryDate && um.expiryDate >= now && um.expiryDate <= threeMonths);
  const lowStock = user.medicines.filter((um) => um.quantity <= 3);
  const noExpiry = user.medicines.filter((um) => !um.expiryDate);

  const lines = [
    `📊 *Отчёт по аптечке*\n`,
    `💊 Всего лекарств: ${total}`,
    '',
    `⛔ *Просрочено:* ${expired.length}`,
    ...expired.map((um) => `   • ${um.medicine.name} — просрочено ${um.expiryDate?.toLocaleDateString('ru-RU')}`),
    '',
    `⚠️ *Истекает в ближайшие 3 месяца:* ${expiringSoon.length}`,
    ...expiringSoon.map((um) => `   • ${um.medicine.name} — до ${um.expiryDate?.toLocaleDateString('ru-RU')} (${um.quantity} шт.)`),
    '',
    `📦 *Мало (<=3 шт.):* ${lowStock.length}`,
    ...lowStock.map((um) => `   • ${um.medicine.name} — ${um.quantity} шт.`),
    '',
    ...(noExpiry.length > 0 ? [`❓ *Без срока:* ${noExpiry.length}`] : []),
  ];

  await ctx.reply(lines.join('\n'), { parse_mode: 'Markdown' });
});