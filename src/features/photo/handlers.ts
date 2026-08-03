import { Composer, InlineKeyboard } from 'grammy';
import { InputFile } from 'grammy';
import type { BotContext } from '../../shared/types';
import { recognizeMedicineFromPhoto } from '../../shared/ai';
import { prisma } from '../../shared/database';

const composer = new Composer<BotContext>();

composer.hears('📷 Распознать по фото', async (ctx) => {
  await ctx.reply(
    '📷 Пришлите фото упаковки лекарства.\n\n'
    + 'Я распознаю:\n'
    + '• Название лекарства\n'
    + '• Срок годности\n'
    + '• Дозировку\n'
    + '• Действующее вещество',
  );
  ctx.session.awaitingInput = 'photo_recognition';
});

composer.on(':photo', async (ctx) => {
  if (ctx.session.awaitingInput !== 'photo_recognition') return;

  await ctx.reply('📸 Фото получено! Идёт распознавание через DeepSeek...');

  try {
    const photo = ctx.message?.photo;
    if (!photo) return;
    const largest = photo[photo.length - 1];
    const file = await ctx.api.getFile(largest.file_id);
    const filePath = file.file_path;

    if (!filePath) {
      await ctx.reply('Не удалось получить файл. Попробуйте снова.');
      return;
    }

    const fileUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${filePath}`;
    const response = await fetch(fileUrl);
    const buffer = Buffer.from(await response.arrayBuffer());
    const base64 = buffer.toString('base64');
    const mimeType = 'image/jpeg';

    const result = await recognizeMedicineFromPhoto(base64, mimeType);

    if (result.confidence === 'low' || !result.name || result.name === 'Неизвестно') {
      await ctx.reply(
        '😕 Не удалось уверенно распознать лекарство.\n\n'
        + 'Пожалуйста, введите данные вручную через "📷 Добавить лекарство".'
      );
      ctx.session.awaitingInput = undefined;
      return;
    }

    const keyboard = new InlineKeyboard()
      .text('✅ Всё верно', `ai_confirm:${encodeURIComponent(result.name)}:${result.expiryDate || ''}:${result.quantity || 0}`)
      .text('✏️ Исправить', 'ai_edit');

    await ctx.reply(
      `📷 *Распознано:*\n\n`
      + `💊 *Название:* ${result.name}\n`
      + `${result.dosage ? `💉 Дозировка: ${result.dosage}\n` : ''}`
      + `${result.activeIngredient ? `🧪 Действ. вещество: ${result.activeIngredient}\n` : ''}`
      + `${result.expiryDate ? `📅 Срок годности: ${result.expiryDate}\n` : ''}`
      + `${result.quantity ? `🔢 Количество: ${result.quantity} шт.\n` : ''}`
      + `\nВсё верно?`,
      { parse_mode: 'Markdown', reply_markup: keyboard },
    );

    ctx.session.tempData = {
      name: result.name,
      expiry: result.expiryDate,
      quantity: result.quantity,
      dosage: result.dosage,
      activeIngredient: result.activeIngredient,
    };
    ctx.session.awaitingInput = undefined;
  } catch (err) {
    console.error('Photo recognition error:', err);
    await ctx.reply(
      '❌ Ошибка распознавания. Попробуйте ещё раз или добавьте вручную через "📷 Добавить лекарство".'
    );
    ctx.session.awaitingInput = undefined;
  }
});

composer.callbackQuery(/^ai_confirm:(.+):(.+):(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const name = decodeURIComponent(ctx.match[1]);
  const expiryStr = ctx.match[2];
  const quantity = parseInt(ctx.match[3], 10);
  const telegramId = String(ctx.from?.id);

  const user = await prisma.user.findUnique({ where: { telegramId } });
  if (!user) return;

  let medicine = await prisma.medicine.findUnique({ where: { name } });

  if (!medicine) {
    const tempData = ctx.session.tempData as Record<string, unknown> | undefined;
    medicine = await prisma.medicine.create({
      data: {
        name,
        dosage: (tempData?.dosage as string) || null,
        activeIngredient: (tempData?.activeIngredient as string) || null,
        description: `Добавлено через распознавание фото`,
      },
    });
  }

  let expiryDate: Date | null = null;
  if (expiryStr) {
    const parts = expiryStr.split('.');
    if (parts.length === 3) {
      expiryDate = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
    }
  }

  const existing = await prisma.userMedicine.findUnique({
    where: { userId_medicineId: { userId: user.id, medicineId: medicine.id } },
  });

  if (existing) {
    await prisma.userMedicine.update({
      where: { id: existing.id },
      data: {
        quantity: existing.quantity + (quantity || 1),
        expiryDate: expiryDate || existing.expiryDate,
      },
    });
  } else {
    await prisma.userMedicine.create({
      data: {
        userId: user.id,
        medicineId: medicine.id,
        quantity: quantity || 1,
        expiryDate,
      },
    });
  }

  await ctx.reply(
    `✅ *${name}* добавлен(о) в аптечку!`,
    { parse_mode: 'Markdown' },
  );

  ctx.session.tempData = undefined;
});

composer.callbackQuery('ai_edit', async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.awaitingInput = 'add_medicine';
  await ctx.reply('Введите данные вручную:\n`Название, срок годности, количество`', { parse_mode: 'Markdown' });
});

export function registerPhotoHandlers(bot: { use: (composer: Composer<BotContext>) => void }): void {
  bot.use(composer);
}