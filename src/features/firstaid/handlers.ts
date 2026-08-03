import { Composer, InlineKeyboard } from 'grammy';
import type { BotContext } from '../../shared/types';
import { prisma } from '../../shared/database';

const composer = new Composer<BotContext>();

const firstAidCategories: Record<string, { emoji: string; label: string }> = {
  temperature: { emoji: '🌡️', label: 'Температура/Жар' },
  pain: { emoji: '🤕', label: 'Боль' },
  allergy: { emoji: '🤧', label: 'Аллергия' },
  cold: { emoji: '🤒', label: 'Простуда/Кашель' },
  stomach: { emoji: '🤢', label: 'Желудок' },
  wound: { emoji: '🩹', label: 'Раны/Ссадины' },
};

composer.hears('🏥 Первая помощь', async (ctx) => {
  const keyboard = new InlineKeyboard();

  for (const [key, cat] of Object.entries(firstAidCategories)) {
    keyboard.text(`${cat.emoji} ${cat.label}`, `firstaid:${key}`);
    if (key === 'pain' || key === 'cold' || key === 'wound') {
      keyboard.row();
    }
  }

  await ctx.reply(
    '🏥 *Первая помощь*\n\n'
    + 'Выберите категорию, чтобы увидеть, что есть в аптечке:',
    { parse_mode: 'Markdown', reply_markup: keyboard },
  );
});

composer.callbackQuery(/^firstaid:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const category = ctx.match[1];
  const catInfo = firstAidCategories[category];

  if (!catInfo) return;

  const telegramId = String(ctx.from?.id);
  const user = await prisma.user.findUnique({
    where: { telegramId },
    include: {
      medicines: {
        include: { medicine: true },
        where: {
          expiryDate: { gt: new Date() },
          quantity: { gt: 0 },
          medicine: { category },
        },
      },
    },
  });

  if (!user || user.medicines.length === 0) {
    await ctx.reply(
      `${catInfo.emoji} *${catInfo.label}*\n\n`
      + 'В аптечке нет лекарств этой категории.',
      { parse_mode: 'Markdown' },
    );
    return;
  }

  const list = user.medicines
    .map((um) => `• *${um.medicine.name}* — ${um.quantity} шт.${um.medicine.dosage ? ` (${um.medicine.dosage})` : ''}`)
    .join('\n');

  await ctx.reply(
    `${catInfo.emoji} *${catInfo.label}* — что есть в аптечке:\n\n${list}`,
    { parse_mode: 'Markdown' },
  );
});

export function registerFirstAidHandlers(bot: { use: (composer: Composer<BotContext>) => void }): void {
  bot.use(composer);
}