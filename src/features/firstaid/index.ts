import { Composer, InlineKeyboard } from 'grammy';
import type { BotContext } from '../../shared/types';
import { prisma } from '../../shared/database';

export const firstaidComposer = new Composer<BotContext>();

const VALID_CATEGORIES = ['temperature', 'pain', 'allergy', 'cold', 'stomach', 'wound'] as const;

const CATEGORIES: Record<string, string> = {
  temperature: '🌡️ Температура',
  pain: '🤕 Боль',
  allergy: '🤧 Аллергия',
  cold: '🤒 Простуда',
  stomach: '🤢 Желудок',
  wound: '🩹 Раны',
};

firstaidComposer.hears('🏥 Первая помощь', async (ctx) => {
  const keyboard = new InlineKeyboard()
    .text('🌡️ Температура', 'firstaid:temperature')
    .text('🤕 Боль', 'firstaid:pain')
    .row()
    .text('🤧 Аллергия', 'firstaid:allergy')
    .text('🤒 Простуда', 'firstaid:cold')
    .row()
    .text('🤢 Желудок', 'firstaid:stomach')
    .text('🩹 Раны', 'firstaid:wound');

  await ctx.reply('🏥 *Первая помощь*\n\nВыберите категорию:', {
    parse_mode: 'Markdown',
    reply_markup: keyboard,
  });
});

firstaidComposer.callbackQuery(/^firstaid:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const category = ctx.match[1];

  const telegramId = String(ctx.from?.id);
  const user = await prisma.user.findUnique({
    where: { telegramId },
    include: {
      medicines: {
        include: { medicine: true },
        where: { expiryDate: { gt: new Date() }, quantity: { gt: 0 }, medicine: { category } },
      },
    },
  });
  if (!user || user.medicines.length === 0) {
    await ctx.reply(`${CATEGORIES[category] || category}\n\nВ аптечке нет лекарств этой категории.`);
    return;
  }
  const list = user.medicines.map((um) => `• *${um.medicine.name}* — ${um.quantity} шт.`).join('\n');
  await ctx.reply(`${CATEGORIES[category] || category}:\n\n${list}`, { parse_mode: 'Markdown' });
});