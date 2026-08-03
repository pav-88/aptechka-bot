import { Composer, InlineKeyboard } from 'grammy';
import type { BotContext } from '../../shared/types';
import { prisma } from '../../shared/database';
import { getMedicineDescription } from '../../shared/ai';
import { logger } from '../../shared/logger';

const PAGE_SIZE = 5;

export const medicinesComposer = new Composer<BotContext>();

medicinesComposer.hears('💊 Справочник лекарств', async (ctx) => {
  await ctx.reply('Введите название лекарства для поиска:');
  ctx.session.awaitingInput = 'search_medicine';
});

async function findAnaloguesInMyKit(telegramId: string, activeIngredient: string): Promise<string[]> {
  if (!activeIngredient) return [];

  try {
    const user = await prisma.user.findUnique({ where: { telegramId } });
    if (!user) return [];

    const analogues = await prisma.medicine.findMany({
      where: {
        activeIngredient,
        userMedicines: { some: { userId: user.id } },
      },
      select: { name: true },
    });

    return analogues.map(a => a.name);
  } catch {
    return [];
  }
}

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
  const telegramId = String(ctx.from?.id);

  for (const m of medicines) {
    let text = `💊 *${m.name}*`;
    if (m.dosage) text += `\n💉 *Дозировка:* ${m.dosage}`;
    if (m.category) text += `\n📂 *Категория:* ${m.category}`;
    if (m.activeIngredient) text += `\n🧪 *Действующее вещество:* ${m.activeIngredient}`;

    const analogues = await findAnaloguesInMyKit(telegramId, m.activeIngredient || '');
    if (analogues.length > 0) {
      text += `\n\n✅ *В вашей аптечке:* ${analogues.join(', ')}`;
    }

    const kb = new InlineKeyboard().text('ℹ️ Инструкция', `medicine_info:${m.name}`);

    await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: kb });
  }

  if (hasMore) {
    const kb = new InlineKeyboard().text(`➡️ Ещё (${Math.min(offset + PAGE_SIZE, total)}/${total})`, `search_more:${query}:${offset + PAGE_SIZE}`);
    await ctx.reply('Показать ещё?', { reply_markup: kb });
  } else {
    await ctx.reply('Чтобы узнать подробнее — нажмите "ℹ️ Инструкция" под любым препаратом.');
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

medicinesComposer.callbackQuery(/^medicine_info:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const name = ctx.match[1];

  await ctx.reply(`🔍 Запрашиваю информацию о *${name}*...`, { parse_mode: 'Markdown' });

  const description = await getMedicineDescription(name);

  if (!description) {
    await ctx.reply('Не удалось получить информацию. Убедитесь, что настроен DEEPSEEK_API_KEY.');
    return;
  }

  await ctx.reply(`ℹ️ *${name}*\n\n${description}`, { parse_mode: 'Markdown' });
});