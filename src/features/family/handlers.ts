import { Composer, InlineKeyboard } from 'grammy';
import type { BotContext } from '../../shared/types';
import { prisma } from '../../shared/database';

const composer = new Composer<BotContext>();

composer.hears('👨‍👩‍👧‍👧 Семья', async (ctx) => {
  const telegramId = String(ctx.from?.id);
  const user = await prisma.user.findUnique({
    where: { telegramId },
    include: { familyMembers: true },
  });

  if (!user) return;

  if (user.familyMembers.length === 0) {
    const keyboard = new InlineKeyboard().text('Добавить члена семьи', 'family_add');
    await ctx.reply(
      '👨‍👩‍👧‍👧 Семья пока не настроена.\n\n'
      + 'Добавьте членов семьи, чтобы бот мог:\n'
      + '• Учитывать возраст и пол при рекомендациях\n'
      + '• Назначать напоминания для каждого\n'
      + '• Хранить историю назначений по каждому',
      { reply_markup: keyboard },
    );
    return;
  }

  const list = user.familyMembers
    .map((m) => {
      const age = Math.floor((Date.now() - m.birthDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
      const gender = m.gender === 'male' ? '♂️' : '♀️';
      return `${gender} *${m.name}* — ${age} лет (${m.relation})`;
    })
    .join('\n');

  const keyboard = new InlineKeyboard()
    .text('Добавить', 'family_add')
    .text('Удалить', 'family_remove');

  await ctx.reply(`👨‍👩‍👧‍👧 *Семья:*\n\n${list}`, {
    parse_mode: 'Markdown',
    reply_markup: keyboard,
  });
});

composer.callbackQuery('family_add', async (ctx) => {
  await ctx.answerCallbackQuery();
  const telegramId = String(ctx.from?.id);
  const user = await prisma.user.findUnique({ where: { telegramId }, include: { familyMembers: true } });

  if (user && user.familyMembers.length >= 10) {
    await ctx.reply('Максимум 10 членов семьи.');
    return;
  }

  await ctx.reply(
    'Введите данные нового члена семьи в формате:\n\n'
    + '`Имя, пол(m/w), дата рождения(ДД.ММ.ГГГГ), отношение`\n\n'
    + 'Пример:\n'
    + '`Алексей, m, 01.02.1988, супруг`',
    { parse_mode: 'Markdown' },
  );
  ctx.session.awaitingInput = 'family_add';
});

composer.on('message:text', async (ctx) => {
  if (ctx.session.awaitingInput === 'family_add') {
    const text = ctx.message.text.trim();
    const parts = text.split(',').map((p) => p.trim());

    if (parts.length < 4) {
      await ctx.reply('Неверный формат. Используйте: `Имя, пол(m/w), дата(ДД.ММ.ГГГГ), отношение`', { parse_mode: 'Markdown' });
      return;
    }

    const [name, gender, dateStr, relation] = parts;

    if (gender !== 'm' && gender !== 'w') {
      await ctx.reply('Пол должен быть `m` (мужчина) или `w` (женщина).', { parse_mode: 'Markdown' });
      return;
    }

    const dateParts = dateStr.split('.');
    if (dateParts.length !== 3) {
      await ctx.reply('Неверный формат даты. Используйте `ДД.ММ.ГГГГ`.');
      return;
    }

    const birthDate = new Date(`${dateParts[2]}-${dateParts[1]}-${dateParts[0]}`);

    if (isNaN(birthDate.getTime())) {
      await ctx.reply('Неверная дата рождения.');
      return;
    }

    const telegramId = String(ctx.from?.id);
    const user = await prisma.user.findUnique({ where: { telegramId } });
    if (!user) return;

    try {
      await prisma.familyMember.create({
        data: {
          userId: user.id,
          name,
          gender: gender === 'm' ? 'male' : 'female',
          birthDate,
          relation,
        },
      });
      await ctx.reply(`✅ Член семьи *${name}* добавлен!`, { parse_mode: 'Markdown' });
    } catch {
      await ctx.reply('Член семьи с таким именем уже существует.');
    }

    ctx.session.awaitingInput = undefined;
  }
});

export function registerFamilyHandlers(bot: { use: (composer: Composer<BotContext>) => void }): void {
  bot.use(composer);
}