import { Composer, InlineKeyboard } from 'grammy';
import type { BotContext } from '../../shared/types';
import { prisma } from '../../shared/database';
import { logger } from '../../shared/logger';
import crypto from 'crypto';

export const familyComposer = new Composer<BotContext>();

const MAX_FAMILY_MEMBERS = 10;

async function generateUniqueInviteCode(): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const part1 = crypto.randomBytes(2).toString('hex').toUpperCase();
    const part2 = crypto.randomBytes(2).toString('hex').toUpperCase();
    const code = `APT-${part1}-${part2}`;
    const existing = await prisma.inviteCode.findUnique({ where: { code } });
    if (!existing) return code;
  }
  throw new Error('Failed to generate unique invite code after 5 attempts');
}

familyComposer.hears('👨‍👩‍👧‍👧 Семья', async (ctx) => {
  const telegramId = String(ctx.from?.id);
  const user = await prisma.user.findUnique({
    where: { telegramId },
    include: { familyMembers: { include: { linkedAccounts: true } } },
  });
  if (!user) return;

  if (user.familyMembers.length === 0) {
    const keyboard = new InlineKeyboard().text('Добавить члена семьи', 'family_add');
    await ctx.reply(
      '👨‍👩‍👧‍👧 Семья пока не настроена.\n\nДобавьте членов семьи, чтобы бот мог:\n'
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
      const linked = m.linkedAccounts.length > 0 ? ' ✅(в TG)' : '';
      return `${gender} *${m.name}* — ${age} лет (${m.relation})${linked}`;
    })
    .join('\n');

  const keyboard = new InlineKeyboard()
    .text('Добавить', 'family_add')
    .text('Пригласить', 'family_invite')
    .text('Удалить', 'family_remove');

  await ctx.reply(`👨‍👩‍👧‍👧 *Семья:*\n\n${list}`, {
    parse_mode: 'Markdown',
    reply_markup: keyboard,
  });
});

familyComposer.callbackQuery('family_add', async (ctx) => {
  await ctx.answerCallbackQuery();
  const telegramId = String(ctx.from?.id);
  const user = await prisma.user.findUnique({
    where: { telegramId },
    include: { familyMembers: true },
  });
  if (user && user.familyMembers.length >= MAX_FAMILY_MEMBERS) {
    await ctx.reply(`❌ Достигнут лимит — максимум ${MAX_FAMILY_MEMBERS} членов семьи.`);
    return;
  }
  await ctx.reply(
    'Введите данные в формате:\n`Имя, пол(m/w), дата(ДД.ММ.ГГГГ), отношение`\n\nПример: `Екатерина, w, 08.01.1988, супруга`',
    { parse_mode: 'Markdown' },
  );
  ctx.session.awaitingInput = 'family_add';
});

familyComposer.callbackQuery('family_invite', async (ctx) => {
  await ctx.answerCallbackQuery();
  const telegramId = String(ctx.from?.id);
  const user = await prisma.user.findUnique({
    where: { telegramId },
    include: { familyMembers: true },
  });
  if (!user || user.familyMembers.length === 0) {
    await ctx.reply('Сначала добавьте членов семьи.');
    return;
  }
  const keyboard = new InlineKeyboard();
  for (const member of user.familyMembers) {
    keyboard.text(member.name, `invite_link:${member.id}`);
  }
  await ctx.reply('Выберите, кого пригласить:', { reply_markup: keyboard });
});

familyComposer.callbackQuery(/^invite_link:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const memberId = parseInt(ctx.match[1], 10);
  const member = await prisma.familyMember.findUnique({ where: { id: memberId } });
  if (!member) return;

  let code: string;
  try {
    code = await generateUniqueInviteCode();
  } catch (err) {
    logger.error('Family', 'Failed to generate unique invite code', { error: String(err) });
    await ctx.reply('❌ Ошибка генерации кода. Попробуйте позже.');
    return;
  }

  await prisma.inviteCode.create({
    data: {
      code,
      familyMemberId: member.id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  await ctx.reply(
    `🔗 *Код для ${member.name}:*\n\`${code}\`\n\nСупруга вводит этот код в боте.\nКод действует 7 дней.`,
    { parse_mode: 'Markdown' },
  );
});

familyComposer.callbackQuery('family_remove', async (ctx) => {
  await ctx.answerCallbackQuery();
  const telegramId = String(ctx.from?.id);
  const user = await prisma.user.findUnique({
    where: { telegramId },
    include: { familyMembers: true },
  });
  if (!user || user.familyMembers.length === 0) {
    await ctx.reply('Нет членов семьи для удаления.');
    return;
  }
  const keyboard = new InlineKeyboard();
  for (const member of user.familyMembers) {
    keyboard.text(member.name, `family_remove_confirm:${member.id}`);
  }
  await ctx.reply('Выберите, кого удалить:', { reply_markup: keyboard });
});

familyComposer.callbackQuery(/^family_remove_confirm:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const memberId = parseInt(ctx.match[1], 10);
  const member = await prisma.familyMember.findUnique({ where: { id: memberId } });
  if (!member) return;

  await prisma.familyMemberLinkedAccount.deleteMany({ where: { familyMemberId: member.id } });
  await prisma.inviteCode.deleteMany({ where: { familyMemberId: member.id } });
  await prisma.familyMember.delete({ where: { id: memberId } });

  await ctx.reply(`✅ *${member.name}* удалён(а) из семьи.`, { parse_mode: 'Markdown' });
});