import type { BotContext } from '../../shared/types';
import { prisma } from '../../shared/database';
import { InlineKeyboard } from 'grammy';
import { suggestAnalogues, checkDrugInteraction } from '../../shared/ai';

export async function handleAwaitingInput(ctx: BotContext): Promise<void> {
  if (!ctx.message || !('text' in ctx.message) || !ctx.message.text) return;
  const text = ctx.message.text.trim();
  const telegramId = String(ctx.from?.id);
  const user = await prisma.user.findUnique({ where: { telegramId } });
  if (!user) return;

  const mode = ctx.session.awaitingInput;

  // ====== Справочник лекарств (поиск) ======
  if (mode === 'search_medicine') {
    const total = await prisma.medicine.count({ where: { name: { contains: text } } });
    if (total === 0) {
      await ctx.reply('💊 Лекарство не найдено. Попробуйте другое название.');
      ctx.session.awaitingInput = undefined;
      return;
    }
    const { sendMedicinePage } = await import('../medicines/index');
    ctx.session.tempData = { searchQuery: text, searchOffset: 0 };
    await sendMedicinePage(ctx, text, 0);
    return;
  }

  // ====== Добавление члена семьи ======
  if (mode === 'family_add') {
    const parts = text.split(',').map((p) => p.trim());
    if (parts.length < 4) {
      await ctx.reply('Неверный формат. Используйте: `Имя, пол(m/w), дата(ДД.ММ.ГГГГ), отношение`', { parse_mode: 'Markdown' });
      return;
    }
    const [name, gender, dateStr, relation] = parts;
    if (gender !== 'm' && gender !== 'w') {
      await ctx.reply('Пол: m или w.');
      return;
    }
    const dp = dateStr.split('.');
    if (dp.length !== 3) {
      await ctx.reply('Дата: ДД.ММ.ГГГГ.');
      return;
    }
    const birthDate = new Date(`${dp[2]}-${dp[1]}-${dp[0]}`);
    if (isNaN(birthDate.getTime())) {
      await ctx.reply('Неверная дата.');
      return;
    }
    try {
      await prisma.familyMember.create({
        data: { userId: user.id, name, gender: gender === 'm' ? 'male' : 'female', birthDate, relation },
      });
      await ctx.reply(`✅ *${name}* добавлен!`, { parse_mode: 'Markdown' });
    } catch {
      await ctx.reply('Член семьи с таким именем уже существует.');
    }
    ctx.session.awaitingInput = undefined;
    return;
  }

  // ====== Добавление лекарства ======
  if (mode === 'add_medicine') {
    const parts = text.split(',').map((p) => p.trim());
    if (parts.length < 3) {
      await ctx.reply('Формат: `Название, срок, количество`', { parse_mode: 'Markdown' });
      return;
    }
    const [name, expiryStr, qtyStr] = parts;
    const quantity = parseInt(qtyStr, 10);
    if (isNaN(quantity) || quantity < 1) {
      await ctx.reply('Количество > 0.');
      return;
    }

    const keyboard = new InlineKeyboard()
      .text('✅ Всё верно', `confirm_medicine:${name}:${expiryStr}:${quantity}`)
      .text('✏️ Исправить', 'ai_edit');

    await ctx.reply(
      `Проверьте:\n💊 *${name}*\n📅 Срок: ${expiryStr}\n🔢 ${quantity} шт.`,
      { parse_mode: 'Markdown', reply_markup: keyboard },
    );
    ctx.session.tempData = { name, expiry: expiryStr, quantity };
    ctx.session.awaitingInput = undefined;
    return;
  }

  // ====== Назначение врача (текст) ======
  if (mode === 'prescription') {
    const userWithFamily = await prisma.user.findUnique({
      where: { telegramId },
      include: { familyMembers: true },
    });
    if (!userWithFamily || userWithFamily.familyMembers.length === 0) {
      await ctx.reply('Сначала настройте семью через 👨‍👩‍👧‍👧 Семья.');
      ctx.session.awaitingInput = undefined;
      return;
    }
    const keyboard = new InlineKeyboard();
    for (const member of userWithFamily.familyMembers) {
      keyboard.text(member.name, `presc_member:${member.id}`);
    }
    await ctx.reply('Для кого назначение?', { reply_markup: keyboard });
    ctx.session.tempData = { ...ctx.session.tempData, prescriptionText: text };
    return;
  }

  // ====== Присоединиться к семье (ввод кода) ======
  if (mode === 'join_family') {
    const code = text.toUpperCase();
    if (!code.match(/^APT-([A-F0-9]{4})-([A-F0-9]{4})$/)) {
      await ctx.reply('Неверный код. Формат: `APT-XXXX-XXXX`', { parse_mode: 'Markdown' });
      return;
    }
    const invite = await prisma.inviteCode.findUnique({
      where: { code },
      include: { familyMember: true },
    });
    if (!invite || invite.usedAt || invite.expiresAt < new Date()) {
      await ctx.reply('Код недействителен или истёк.');
      return;
    }
    await ctx.reply(`Код действителен для *${invite.familyMember.name}*. Введите ваше имя для привязки:`, { parse_mode: 'Markdown' });
    ctx.session.tempData = { inviteCodeId: invite.id, memberId: invite.familyMemberId, memberName: invite.familyMember.name };
    ctx.session.awaitingInput = 'join_family_name';
    return;
  }

  // ====== Присоединиться к семье (ввод имени) ======
  if (mode === 'join_family_name') {
    const name = text.trim();
    const inviteCodeId = ctx.session.tempData?.inviteCodeId as number | undefined;
    const memberId = ctx.session.tempData?.memberId as number | undefined;
    if (!inviteCodeId || !memberId) {
      await ctx.reply('Ошибка. Начните заново.');
      ctx.session.awaitingInput = undefined;
      return;
    }

    const member = await prisma.familyMember.findUnique({
      where: { id: memberId },
      include: { linkedAccounts: true },
    });
    if (!member) {
      await ctx.reply('Член семьи не найден.');
      ctx.session.awaitingInput = undefined;
      return;
    }

    const existing = await prisma.familyMemberLinkedAccount.findFirst({
      where: { familyMemberId: member.id, telegramId },
    });
    if (existing) {
      await ctx.reply(`Вы уже привязаны к ${name}.`);
      ctx.session.awaitingInput = undefined;
      return;
    }

    await prisma.familyMemberLinkedAccount.create({
      data: { familyMemberId: member.id, telegramId },
    });

    await prisma.inviteCode.update({
      where: { id: inviteCodeId },
      data: { usedAt: new Date() },
    });

    for (const account of member.linkedAccounts) {
      const u = await prisma.user.findUnique({ where: { telegramId: account.telegramId } });
      if (u && account.telegramId !== telegramId) {
        try {
          await prisma.familyMember.upsert({
            where: { userId_name: { userId: u.id, name: member.name } },
            update: {},
            create: {
              userId: u.id,
              name: member.name,
              gender: member.gender,
              birthDate: member.birthDate,
              relation: member.relation,
            },
          });
        } catch {
          /* skip */
        }
      }
    }

    await ctx.reply(`✅ Вы присоединились как *${name}*!\n\nТеперь вам доступны назначения и напоминания.`, { parse_mode: 'Markdown' });
    ctx.session.awaitingInput = undefined;
    ctx.session.tempData = undefined;
    return;
  }
}