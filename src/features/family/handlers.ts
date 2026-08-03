import { Composer, InlineKeyboard } from 'grammy';
import type { BotContext } from '../../shared/types';
import { prisma } from '../../shared/database';
import crypto from 'crypto';

const composer = new Composer<BotContext>();

function generateInviteCode(): string {
  const part1 = crypto.randomBytes(2).toString('hex').toUpperCase();
  const part2 = crypto.randomBytes(2).toString('hex').toUpperCase();
  return `APT-${part1}-${part2}`;
}

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
      const linked = m.linkedTelegramIds && m.linkedTelegramIds.length > 0 ? ' ✅(в Telegram)' : '';
      return `${gender} *${m.name}* — ${age} лет (${m.relation})${linked}`;
    })
    .join('\n');

  const keyboard = new InlineKeyboard()
    .text('Добавить', 'family_add')
    .text('Пригласить', 'family_invite');

  await ctx.reply(`👨‍👩‍👧‍👧 *Семья:*\n\n${list}`, {
    parse_mode: 'Markdown',
    reply_markup: keyboard,
  });
});

composer.callbackQuery('family_invite', async (ctx) => {
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

  const code = generateInviteCode();

  const keyboard = new InlineKeyboard();
  for (const member of user.familyMembers) {
    keyboard.text(member.name, `invite_link:${member.id}:${code}`);
  }

  await ctx.reply(
    'Выберите, к кому привязать приглашение:\n\n'
    + 'Супруга сможет ввести этот код у себя и управлять этим профилем.',
    { reply_markup: keyboard },
  );
});

composer.callbackQuery(/^invite_link:(\d+):(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const memberId = parseInt(ctx.match[1], 10);
  const code = ctx.match[2];

  const member = await prisma.familyMember.findUnique({ where: { id: memberId } });
  if (!member) return;

  await ctx.reply(
    `🔗 *Код приглашения для ${member.name}:*\n\n`
    + '```\n' + code + '\n```\n\n'
    + 'Отправьте этот код супруге. Она должна:\n'
    + '1. Написать боту `/start`\n'
    + '2. Нажать "👨‍👩‍👧‍👧 Семья"\n'
    + '3. Выбрать "🔗 Присоединиться к семье"\n'
    + '4. Ввести этот код\n\n'
    + `После этого ${member.name} будет доступен у неё в профиле.`,
    { parse_mode: 'Markdown' },
  );

  ctx.session.tempData = { pendingInvite: { memberId, code } };
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
      await ctx.reply(`✅ Член семьи *${name}* добавлен!\n\nТеперь вы можете пригласить супругу через "👨‍👩‍👧‍👧 Семья" → "Пригласить".`, { parse_mode: 'Markdown' });
    } catch {
      await ctx.reply('Член семьи с таким именем уже существует.');
    }

    ctx.session.awaitingInput = undefined;
  }

  if (ctx.session.awaitingInput === 'join_family') {
    const code = ctx.message.text.trim().toUpperCase();
    const match = code.match(/^APT-([A-F0-9]{4})-([A-F0-9]{4})$/);

    if (!match) {
      await ctx.reply('Неверный формат кода. Код должен быть вида: `APT-XXXX-XXXX`', { parse_mode: 'Markdown' });
      return;
    }

    await ctx.reply(
      '🔗 Введите имя члена семьи, к которому хотите присоединиться '
      + '(как оно записано в профиле, например "Екатерина"):'
    );
    ctx.session.tempData = { joinCode: code };
    ctx.session.awaitingInput = 'join_family_name';
  }

  if (ctx.session.awaitingInput === 'join_family_name') {
    const name = ctx.message.text.trim();
    const joinCode = ctx.session.tempData?.joinCode as string;

    if (!joinCode) {
      await ctx.reply('Ошибка: код не найден. Начните заново.');
      ctx.session.awaitingInput = undefined;
      return;
    }

    const member = await prisma.familyMember.findFirst({
      where: { name },
      include: { user: true },
    });

    if (!member) {
      await ctx.reply(
        `Член семьи с именем "${name}" не найден. Убедитесь, что имя написано точно так же, как его ввёл Алексей.`
      );
      return;
    }

    const telegramId = String(ctx.from?.id);

    const existingIds = member.linkedTelegramIds
      ? member.linkedTelegramIds.split(',').filter(Boolean)
      : [];

    if (existingIds.includes(telegramId)) {
      await ctx.reply(`Вы уже привязаны к профилю *${member.name}*.`, { parse_mode: 'Markdown' });
      ctx.session.awaitingInput = undefined;
      return;
    }

    existingIds.push(telegramId);

    await prisma.familyMember.update({
      where: { id: member.id },
      data: { linkedTelegramIds: existingIds.join(',') },
    });

    const member2 = await prisma.familyMember.findUnique({
      where: { id: member.id },
    });

    if (member2 && member2.linkedTelegramIds) {
      const ids = member2.linkedTelegramIds.split(',').filter(Boolean);
      for (const tid of ids) {
        const u = await prisma.user.findUnique({ where: { telegramId: tid } });
        if (tid === telegramId) continue;
        if (u) {
          try {
            const existing = await prisma.familyMember.findFirst({
              where: { userId: u.id, name: member.name },
            });
            if (!existing) {
              await prisma.familyMember.create({
                data: {
                  userId: u.id,
                  name: member.name,
                  gender: member.gender,
                  birthDate: member.birthDate,
                  relation: member.relation,
                },
              });
            }
          } catch {
            // already exists
          }
        }
      }
    }

    await ctx.reply(
      `✅ Вы присоединились к семье как *${member.name}*!\n\n`
      + 'Теперь вам доступны:\n'
      + '• Назначения врача для этого профиля\n'
      + '• Общая аптечка\n'
      + '• Напоминания будут приходить и вам',
      { parse_mode: 'Markdown' },
    );

    ctx.session.awaitingInput = undefined;
    ctx.session.tempData = undefined;
  }
});

export function registerFamilyHandlers(bot: { use: (composer: Composer<BotContext>) => void }): void {
  bot.use(composer);
}