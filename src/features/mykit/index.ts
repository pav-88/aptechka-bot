import { Composer, InlineKeyboard } from 'grammy';
import type { BotContext } from '../../shared/types';
import { prisma } from '../../shared/database';
import { logger } from '../../shared/logger';

const PAGE_SIZE = 10;

export const mykitComposer = new Composer<BotContext>();

mykitComposer.hears('📦 Моя аптечка', async (ctx) => {
  const telegramId = String(ctx.from?.id);
  if (!telegramId) {
    logger.warn('MyKit', 'Missing telegramId');
    return;
  }
  const user = await prisma.user.findUnique({ where: { telegramId } });
  if (!user) {
    logger.warn('MyKit', 'User not found', { telegramId });
    return;
  }
  ctx.session.tempData = { mykitOffset: 0 };
  await sendMyKitPage(ctx, user.id, 0);
});

async function sendMyKitPage(ctx: BotContext, userId: number, offset: number): Promise<void> {
  const now = new Date();
  const total = await prisma.userMedicine.count({ where: { userId } });
  if (total === 0) {
    await ctx.reply('📦 Аптечка пуста. Добавьте лекарства через "📷 Добавить лекарство".');
    return;
  }

  const items = await prisma.userMedicine.findMany({
    where: { userId },
    include: { medicine: true },
    orderBy: { expiryDate: 'asc' },
    take: PAGE_SIZE,
    skip: offset,
  });

  const lines = items.map((um) => {
    const expiry = um.expiryDate ? ` (до ${um.expiryDate.toLocaleDateString('ru-RU')})` : ' (срок не указан)';
    const warn = um.expiryDate && um.expiryDate < now ? ' ⛔ ПРОСРОЧЕНО!' : '';
    const low = um.quantity <= 3 ? ' ⚠️ Мало!' : '';
    return `• *${um.medicine.name}* — ${um.quantity} шт${expiry}${warn}${low}`;
  });

  const hasMore = offset + PAGE_SIZE < total;
  const header = `📦 *Моя аптечка:* (${Math.min(offset + PAGE_SIZE, total)}/${total})\n\n`;
  const text = header + lines.join('\n');

  if (hasMore) {
    const kb = new InlineKeyboard().text(`➡️ Ещё (${Math.min(offset + PAGE_SIZE, total)}/${total})`, `mykit_page:${offset + PAGE_SIZE}`);
    await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: kb });
  } else {
    await ctx.reply(text, { parse_mode: 'Markdown' });
  }
}

mykitComposer.callbackQuery(/^mykit_page:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const offset = parseInt(ctx.match[1], 10);
  const telegramId = String(ctx.from?.id);
  const user = await prisma.user.findUnique({ where: { telegramId } });
  if (!user) return;
  await sendMyKitPage(ctx, user.id, offset);
});