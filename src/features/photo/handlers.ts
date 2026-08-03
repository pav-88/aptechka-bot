import { Composer } from 'grammy';
import type { BotContext } from '../../shared/types';

const composer = new Composer<BotContext>();

composer.hears('📷 Распознать по фото', async (ctx) => {
  await ctx.reply(
    '📷 Пришлите фото упаковки лекарства.\n\n'
    + 'Я попробую распознать:\n'
    + '• Название лекарства\n'
    + '• Срок годности\n'
    + '• Дозировку\n\n'
    + '⚠️ Распознавание по фото находится в разработке.'
  );
});

composer.on(':photo', async (ctx) => {
  await ctx.reply(
    '📸 Фото получено!\n\n'
    + '⚠️ Распознавание по фото пока в разработке.\n'
    + 'Пока вы можете добавить лекарство вручную через "📷 Добавить лекарство".'
  );
});

export function registerPhotoHandlers(bot: { use: (composer: Composer<BotContext>) => void }): void {
  bot.use(composer);
}