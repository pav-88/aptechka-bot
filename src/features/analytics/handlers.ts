import { Composer } from 'grammy';
import type { BotContext } from '../../shared/types';
import { prisma } from '../../shared/database';

const composer = new Composer<BotContext>();

composer.hears('📊 Отчёт по аптечке', async (ctx) => {
  const telegramId = String(ctx.from?.id);
  const user = await prisma.user.findUnique({
    where: { telegramId },
    include: {
      medicines: {
        include: { medicine: true },
      },
      familyMembers: true,
    },
  });

  if (!user) return;

  const now = new Date();
  const threeMonths = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

  const total = user.medicines.length;
  const expired = user.medicines.filter((um) => um.expiryDate && um.expiryDate < now);
  const expiringSoon = user.medicines.filter(
    (um) => um.expiryDate && um.expiryDate >= now && um.expiryDate <= threeMonths,
  );
  const lowStock = user.medicines.filter((um) => um.quantity <= 3);
  const noExpiry = user.medicines.filter((um) => !um.expiryDate);

  const lines: string[] = [
    `📊 *Отчёт по аптечке*\n`,
    `👨‍👩‍👧‍👧 Семья: ${user.familyMembers.map((m) => m.name).join(', ')}`,
    `💊 Всего лекарств: ${total}`,
    '',
    `⛔ *Просрочено:* ${expired.length}`,
  ];

  if (expired.length > 0) {
    lines.push(
      ...expired.map(
        (um) => `   • ${um.medicine.name} — просрочено ${um.expiryDate?.toLocaleDateString('ru-RU')}`,
      ),
    );
  }

  lines.push(
    '',
    `⚠️ *Истекает в ближайшие 3 месяца:* ${expiringSoon.length}`,
  );

  if (expiringSoon.length > 0) {
    lines.push(
      ...expiringSoon.map(
        (um) =>
          `   • ${um.medicine.name} — до ${um.expiryDate?.toLocaleDateString('ru-RU')} (${um.quantity} шт.)`,
      ),
    );
  }

  lines.push('', `📦 *Мало (<=3 шт.):* ${lowStock.length}`);

  if (lowStock.length > 0) {
    lines.push(
      ...lowStock.map((um) => `   • ${um.medicine.name} — ${um.quantity} шт.`),
    );
  }

  if (noExpiry.length > 0) {
    lines.push(
      '',
      `❓ *Без указания срока:* ${noExpiry.length}`,
      ...noExpiry.map((um) => `   • ${um.medicine.name}`),
    );
  }

  await ctx.reply(lines.join('\n'), { parse_mode: 'Markdown' });
});

export function registerAnalyticsHandlers(bot: { use: (composer: Composer<BotContext>) => void }): void {
  bot.use(composer);
}