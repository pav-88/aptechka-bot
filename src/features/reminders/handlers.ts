import { Composer } from 'grammy';
import type { BotContext } from '../../shared/types';
import { prisma } from '../../shared/database';

const composer = new Composer<BotContext>();

composer.hears('⏰ Напоминания', async (ctx) => {
  const telegramId = String(ctx.from?.id);
  const user = await prisma.user.findUnique({
    where: { telegramId },
    include: {
      reminders: {
        include: { medicine: true, familyMember: true },
        where: { active: true },
      },
    },
  });

  if (!user || user.reminders.length === 0) {
    await ctx.reply(
      '⏰ У вас нет активных напоминаний.\n\n'
      + 'Напоминания создаются автоматически:\n'
      + '• Когда срок годности лекарства подходит к концу\n'
      + '• Когда осталось менее 3 шт.'
    );
    return;
  }

  const list = user.reminders
    .map((r) => {
      const member = r.familyMember ? ` (${r.familyMember.name})` : '';
      const type = r.type === 'expiry' ? '📅 Истекает срок' : '📦 Заканчивается';
      return `${type}: *${r.medicine.name}*${member}\n└ Расписание: ${r.cronExpr}`;
    })
    .join('\n\n');

  await ctx.reply(`⏰ *Активные напоминания:*\n\n${list}`, { parse_mode: 'Markdown' });
});

export function registerReminderHandlers(bot: { use: (composer: Composer<BotContext>) => void }): void {
  bot.use(composer);
}