import { Composer } from 'grammy';
import type { BotContext } from '../../shared/types';
import { prisma } from '../../shared/database';
import { InlineKeyboard } from 'grammy';

const composer = new Composer<BotContext>();

composer.hears('💊 Справочник лекарств', async (ctx) => {
  await ctx.reply('Введите название лекарства для поиска:');
  ctx.session.awaitingInput = 'search_medicine';
});

composer.on('message:text', async (ctx) => {
  if (ctx.session.awaitingInput !== 'search_medicine') return;

  const query = ctx.message.text.trim();
  if (!query) return;

  const medicines = await prisma.medicine.findMany({
    where: { name: { contains: query } },
    take: 10,
  });

  if (medicines.length === 0) {
    await ctx.reply(
      '💊 Лекарство не найдено в базе.\n\n'
      + 'Вы можете:\n'
      + '• Попробовать другое название\n'
      + '• Добавить его через "📷 Добавить лекарство"'
    );
    return;
  }

  for (const medicine of medicines) {
    const text = [
      `💊 *${medicine.name}*`,
      medicine.description ? `📝 ${medicine.description}` : null,
      medicine.dosage ? `💉 Дозировка: ${medicine.dosage}` : null,
      medicine.activeIngredient ? `🧪 Действующее вещество: ${medicine.activeIngredient}` : null,
      medicine.category ? `🏷️ Категория: ${medicine.category}` : null,
      medicine.instructions ? `📋 Инструкция: ${medicine.instructions}` : null,
    ]
      .filter(Boolean)
      .join('\n');

    const keyboard = new InlineKeyboard().text(
      '🔍 Инструкция на сайте',
      `medicine_web:${medicine.id}`,
    );

    await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: keyboard });
  }

  ctx.session.awaitingInput = undefined;
});

export function registerMedicineHandlers(bot: { use: (composer: Composer<BotContext>) => void }): void {
  bot.use(composer);
}