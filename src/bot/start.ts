import type { BotContext } from '../shared/types';
import { mainKeyboard } from '../shared/keyboard';
import { prisma } from '../shared/database';

export async function startHandler(ctx: BotContext): Promise<void> {
  const telegramId = String(ctx.from?.id);
  const firstName = ctx.from?.first_name;
  const lastName = ctx.from?.last_name;
  const username = ctx.from?.username;

  const user = await prisma.user.upsert({
    where: { telegramId },
    update: { firstName, lastName, username },
    create: { telegramId, firstName, lastName, username },
  });

  const familyCount = await prisma.familyMember.count({ where: { userId: user.id } });

  let greeting = `👋 Привет, *${firstName || 'друг'}*! Добро пожаловать в *Аптечку*!\n\n`;
  greeting += 'Я помогу тебе управлять домашней аптечкой:\n\n';
  greeting += '💊 *Справочник лекарств* — поиск по названию\n';
  greeting += '📦 *Моя аптечка* — список всех лекарств\n';
  greeting += '📷 *Добавить лекарство* — фото или текст\n';
  greeting += '🩺 *Назначение врача* — сверка с аптечкой\n';
  greeting += '⏰ *Напоминания* — контроль сроков и остатков\n';
  greeting += '📊 *Отчёт* — сводка по аптечке\n';
  greeting += '🏥 *Первая помощь* — что есть по категориям\n';
  greeting += '👨‍👩‍👧‍👧 *Семья* — профили для каждого\n';

  if (familyCount === 0) {
    greeting += '\n⚠️ *Совет:* Настройте семью через меню "👨‍👩‍👧‍👧 Семья", чтобы бот знал, для кого назначения.';
  }

  await ctx.reply(greeting, { parse_mode: 'Markdown', reply_markup: mainKeyboard });
}