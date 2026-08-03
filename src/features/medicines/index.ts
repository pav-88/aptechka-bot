import { Composer, InlineKeyboard } from 'grammy';
import type { BotContext } from '../../shared/types';
import { prisma } from '../../shared/database';
import { getMedicineDescription } from '../../shared/ai';

const PAGE_SIZE = 5;

const CYRILLIC_ALIKE: Record<string, string> = {
  а: 'ао',
  о: 'ао',
  е: 'еиэ',
  и: 'еи',
  э: 'еэ',
  ы: 'ыи',
  у: 'у',
  ю: 'у',
};

function normalizeFuzzy(word: string): string {
  return word.toLowerCase().replace(/ё/g, 'е').replace(/ъ/g, 'ь');
}

function cjkSimilarity(a_: string, b_: string): number {
  if (!a_ || !b_) return 0;
  const a = normalizeFuzzy(a_);
  const b = normalizeFuzzy(b_);

  const bigrams = new Map<string, number>();
  for (let i = 0; i < a.length - 1; i++) {
    const bg = a.slice(i, i + 2);
    bigrams.set(bg, (bigrams.get(bg) || 0) + 1);
  }

  let intersection = 0;
  for (let i = 0; i < b.length - 1; i++) {
    const bg = b.slice(i, i + 2);
    const cnt = bigrams.get(bg) || 0;
    if (cnt > 0) {
      bigrams.set(bg, cnt - 1);
      intersection++;
    }
  }

  return (2 * intersection) / (a.length + b.length - 2 || 1);
}

function synonymScore(query: string, name: string): number {
  if (name.length < 3 || query.length < 3) return 0;

  const SIMILARITY_THRESHOLD = 0.35;

  if (name.includes(query)) return 10;
  if (query.includes(name)) return 8;

  if (cjkSimilarity(query, name) >= SIMILARITY_THRESHOLD) return 6;

  const qChars = normalizeFuzzy(query).split('');
  const nChars = normalizeFuzzy(name).split('');
  let matchCount = 0;
  const used = new Set<number>();
  for (const qc of qChars) {
    const allowed = CYRILLIC_ALIKE[qc] || qc;
    for (let j = 0; j < nChars.length; j++) {
      if (used.has(j)) continue;
      if (allowed.includes(nChars[j])) {
        used.add(j);
        matchCount++;
        break;
      }
    }
  }
  const overlapRatio = matchCount / Math.max(qChars.length, nChars.length);
  return overlapRatio >= 0.7 ? 4 : 0;
}

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
  const tokens = normalizeFuzzy(prefix).split(/\s+/);
  const all = await prisma.medicine.findMany({ orderBy: { name: 'asc' } });
  return all.map(m => {
    const name = normalizeFuzzy(m.name);
    let score = 0;
    for (const t of tokens) {
      if (name.includes(t)) score += 12;
      if (name.startsWith(t)) score += 6;
      if (m.activeIngredient && normalizeFuzzy(m.activeIngredient).includes(t)) score += 4;
      score += synonymScore(t, name);
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