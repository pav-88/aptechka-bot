import { Composer, InlineKeyboard } from 'grammy';
import type { BotContext } from '../../shared/types';
import { prisma } from '../../shared/database';

const composer = new Composer<BotContext>();

composer.hears('📷 Добавить лекарство', async (ctx) => {
  await ctx.reply(
    'Пришлите фото упаковки лекарства или напишите название.\n\n'
    + 'Формат текстом:\n'
    + '`Название, срок годности(ДД.ММ.ГГГГ), количество`\n\n'
    + 'Пример:\n'
    + '`Нурофен, 12.2026, 1`',
    { parse_mode: 'Markdown' },
  );
  ctx.session.awaitingInput = 'add_medicine';
});

composer.on(':photo', async (ctx) => {
  if (ctx.session.awaitingInput === 'add_medicine') {
    await ctx.reply(
      '📸 Фото получено! Идёт распознавание...\n\n'
      + '⚠️ Распознавание по фото находится в разработке.\n'
      + 'Пока напишите название лекарства текстом:\n'
      + '`Название, срок годности(ДД.ММ.ГГГГ), количество`',
      { parse_mode: 'Markdown' },
    );
  }
});

composer.on('message:text', async (ctx) => {
  if (ctx.session.awaitingInput === 'add_medicine') {
    const text = ctx.message.text.trim();
    const parts = text.split(',').map((p) => p.trim());

    if (parts.length < 3) {
      await ctx.reply(
        'Неверный формат. Используйте:\n'
        + '`Название, срок годности(ДД.ММ.ГГГГ), количество`\n\n'
        + 'Пример: `Нурофен, 12.2026, 1`',
        { parse_mode: 'Markdown' },
      );
      return;
    }

    const [name, expiryStr, qtyStr] = parts;
    const quantity = parseInt(qtyStr, 10);

    if (isNaN(quantity) || quantity < 1) {
      await ctx.reply('Количество должно быть числом больше 0.');
      return;
    }

    let expiryDate: Date | null = null;

    if (expiryStr) {
      const parts = expiryStr.split('.');
      if (parts.length === 2) {
        const month = parseInt(parts[0], 10) - 1;
        const year = parseInt(parts[1], 10);
        expiryDate = new Date(year, month + 1, 0);
      } else if (parts.length === 3) {
        expiryDate = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
      }

      if (expiryDate && isNaN(expiryDate.getTime())) {
        expiryDate = null;
      }
    }

    const keyboard = new InlineKeyboard()
      .text('✅ Всё верно', `confirm_medicine:${name}:${expiryStr}:${quantity}`)
      .text('✏️ Исправить', 'edit_medicine');

    await ctx.reply(
      `Проверьте введённые данные:\n\n`
      + `💊 *Название:* ${name}\n`
      + `📅 *Срок годности:* ${expiryStr || 'не указан'}\n`
      + `🔢 *Количество:* ${quantity} шт.`,
      { parse_mode: 'Markdown', reply_markup: keyboard },
    );

    ctx.session.tempData = { name, expiry: expiryStr, quantity };
    ctx.session.awaitingInput = undefined;
  }
});

composer.callbackQuery(/^confirm_medicine:(.+):(.+):(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const [, name, expiryStr, qtyStr] = ctx.match;
  const quantity = parseInt(qtyStr, 10);
  const telegramId = String(ctx.from?.id);

  const user = await prisma.user.findUnique({ where: { telegramId } });
  if (!user) return;

  let medicine = await prisma.medicine.findUnique({ where: { name } });

  if (!medicine) {
    medicine = await prisma.medicine.create({
      data: {
        name,
        description: `Добавлено пользователем ${user.firstName || telegramId}`,
      },
    });
  }

  let expiryDate: Date | null = null;
  if (expiryStr) {
    const parts = expiryStr.split('.');
    if (parts.length === 2) {
      const m = parseInt(parts[0], 10) - 1;
      const y = parseInt(parts[1], 10);
      expiryDate = new Date(y, m + 1, 0);
    } else if (parts.length === 3) {
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
        quantity: existing.quantity + quantity,
        expiryDate: expiryDate || existing.expiryDate,
      },
    });
  } else {
    await prisma.userMedicine.create({
      data: {
        userId: user.id,
        medicineId: medicine.id,
        quantity,
        expiryDate,
      },
    });
  }

  await ctx.reply(
    `✅ *${name}* добавлен(о) в аптечку!\n`
    + `Количество: ${quantity} шт.\n`
    + `Срок годности: ${expiryStr || 'не указан'}`,
    { parse_mode: 'Markdown' },
  );
});

composer.callbackQuery('edit_medicine', async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.awaitingInput = 'add_medicine';
  await ctx.reply('Введите данные заново в формате:\n`Название, срок годности, количество`', { parse_mode: 'Markdown' });
});

composer.hears('📦 Моя аптечка', async (ctx) => {
  const telegramId = String(ctx.from?.id);
  const user = await prisma.user.findUnique({
    where: { telegramId },
    include: {
      medicines: {
        include: { medicine: true },
        orderBy: { expiryDate: 'asc' },
      },
    },
  });

  if (!user || user.medicines.length === 0) {
    await ctx.reply('📦 Аптечка пуста. Добавьте лекарства через "📷 Добавить лекарство".');
    return;
  }

  const now = new Date();
  const lines = user.medicines.map((um) => {
    const expiry = um.expiryDate
      ? ` (до ${um.expiryDate.toLocaleDateString('ru-RU')})`
      : ' (срок не указан)';
    const warn = um.expiryDate && um.expiryDate < now ? ' ⛔ ПРОСРОЧЕНО!' : '';
    const low = um.quantity <= 3 ? ' ⚠️ Мало!' : '';
    return `• *${um.medicine.name}* — ${um.quantity} шт${expiry}${warn}${low}`;
  });

  const chunks: string[] = [];
  let current = '📦 *Моя аптечка:*\n\n';

  for (const line of lines) {
    if ((current + line).length > 4000) {
      chunks.push(current);
      current = '';
    }
    current += line + '\n';
  }
  chunks.push(current);

  for (const chunk of chunks) {
    await ctx.reply(chunk, { parse_mode: 'Markdown' });
  }
});

export function registerMyKitHandlers(bot: { use: (composer: Composer<BotContext>) => void }): void {
  bot.use(composer);
}