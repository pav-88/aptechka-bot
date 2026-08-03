import { Composer, InlineKeyboard } from 'grammy';
import type { BotContext } from '../../shared/types';
import { prisma } from '../../shared/database';
import { getMedicineDescription } from '../../shared/ai';

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

async function renderMedicines(ctx: BotContext, medicines: { name: string; dosage: string | null; category: string | null; activeIngredient: string | null }[]): Promise<void> {
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
}

async function fuzzySearch(prefix: string) {
  const tokens = prefix.toLowerCase().split(/\s+/);
  const all = await prisma.medicine.findMany({ orderBy: { name: 'asc' } });
  return all.map(m => {
    const name = m.name.toLowerCase();
    let score = 0;
    for (const t of tokens) {
      if (name.includes(t)) score += 10;
      if (name.startsWith(t)) score += 5;
      if (m.activeIngredient?.toLowerCase().includes(t)) score += 3;
    }
    return { medicine: m, score };
  }).filter(x => x.score > 0).sort((a, b) => b.score - a.score);
}

export async function handleSearchMedicine(ctx: BotContext): Promise<boolean> {
  const query = ctx.message?.text?.trim();
  if (!query) return false;

  const exact = await prisma.medicine.findMany({
    where: { name: { contains: query } },
    orderBy: { name: 'asc' },
  });

  if (exact.length > 0) {
    ctx.session.awaitingInput = undefined;
    ctx.session.tempData = undefined;
    await renderMedicines(ctx, exact.slice(0, PAGE_SIZE));

    const total = exact.length;
    if (total > PAGE_SIZE) {
      const kb = new InlineKeyboard().text(`➡️ Ещё (${PAGE_SIZE}/${total})`, `search_more:${query}:${PAGE_SIZE}`);
      await ctx.reply('Показать ещё?', { reply_markup: kb });
    } else {
      await ctx.reply('Чтобы узнать подробнее — нажмите "ℹ️ Инструкция" под любым препаратом.');
    }
    return true;
  }

  const fuzzy = await fuzzySearch(query);

  if (fuzzy.length === 0) {
    await ctx.reply('💊 Лекарство не найдено. Попробуйте другое название.');
    return false;
  }

  ctx.session.awaitingInput = undefined;
  ctx.session.tempData = undefined;
  await renderMedicines(ctx, fuzzy.slice(0, PAGE_SIZE).map(x => x.medicine));
  await ctx.reply('Чтобы узнать подробнее — нажмите "ℹ️ Инструкция" под любым препаратом.');
  return true;
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

  await renderMedicines(ctx, medicines);

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