import { Composer, InlineKeyboard } from 'grammy';
import type { BotContext } from '../../shared/types';
import { prisma } from '../../shared/database';

const PAGE_SIZE = 5;

export const medicinesComposer = new Composer<BotContext>();

medicinesComposer.hears('💊 Справочник лекарств', async (ctx) => {
  await ctx.reply('Введите название лекарства для поиска:');
  ctx.session.awaitingInput = 'search_medicine';
});

export async function sendMedicinePage(ctx: BotContext, query: string, offset: number): Promise<void> {
  const medicines = await prisma.medicine.findMany({
    where: { name: { contains: query } },
    take: PAGE_SIZE,
    skip: offset,
  });
  if (medicines.length === 0) {
    await ctx.reply('💊 Лекарство не найдено.');
    ctx.session.awaitingInput = undefined;
    return;
  }
  const total = await prisma.medicine.count({ where: { name: { contains: query } } });
  const hasMore = offset + PAGE_SIZE < total;
  for (const m of medicines) {
    await ctx.reply(
      `💊 *${m.name}*${m.description ? `\n📝 ${m.description}` : ''}${m.dosage ? `\n💉 ${m.dosage}` : ''}${m.activeIngredient ? `\n🧪 ${m.activeIngredient}` : ''}`,
      { parse_mode: 'Markdown' },
    );
  }
  if (hasMore) {
    const kb = new InlineKeyboard().text(`➡️ Ещё (${Math.min(offset + PAGE_SIZE, total)}/${total})`, `search_more:${query}:${offset + PAGE_SIZE}`);
    await ctx.reply('Показать ещё?', { reply_markup: kb });
  } else {
    ctx.session.awaitingInput = undefined;
    ctx.session.tempData = undefined;
  }
}

medicinesComposer.callbackQuery(/^search_more:(.+):(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const query = ctx.match[1];
  const offset = parseInt(ctx.match[2], 10);
  await sendMedicinePage(ctx, query, offset);
});