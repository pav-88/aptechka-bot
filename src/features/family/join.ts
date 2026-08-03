import { Composer } from 'grammy';
import type { BotContext } from '../../shared/types';

const composer = new Composer<BotContext>();

composer.hears('🔗 Присоединиться к семье', async (ctx) => {
  await ctx.reply(
    '🔗 Введите код приглашения, который показал другой член семьи.\n\n'
    + 'Код выглядит так: `APT-XXXX-XXXX`',
    { parse_mode: 'Markdown' },
  );
  ctx.session.awaitingInput = 'join_family';
});

export function registerJoinFamilyHandlers(bot: { use: (composer: Composer<BotContext>) => void }): void {
  bot.use(composer);
}