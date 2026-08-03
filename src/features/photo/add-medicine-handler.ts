import { Composer, InlineKeyboard } from 'grammy';
import type { BotContext } from '../../shared/types';
import { prisma } from '../../shared/database';

export const addMedicineComposer = new Composer<BotContext>();

addMedicineComposer.hears('📷 Добавить лекарство', async (ctx) => {
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

addMedicineComposer.callbackQuery(/^confirm_medicine:(.+):(.+):(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const name = decodeURIComponent(ctx.match[1]);
  const expiryStr = ctx.match[2];
  const quantity = parseInt(ctx.match[3], 10);
  await confirmAddMedicine(ctx, name, expiryStr, quantity);
});

addMedicineComposer.callbackQuery(/^ai_confirm:(.+):(.+):(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const name = decodeURIComponent(ctx.match[1]);
  const expiryStr = ctx.match[2];
  const quantity = parseInt(ctx.match[3], 10);
  await confirmAddMedicine(ctx, name, expiryStr, quantity);
});

addMedicineComposer.callbackQuery('ai_edit', async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.awaitingInput = 'add_medicine';
  await ctx.reply('Введите вручную:\n`Название, срок, количество`', { parse_mode: 'Markdown' });
});

async function confirmAddMedicine(ctx: BotContext, name: string, expiryStr: string, quantity: number): Promise<void> {
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
        description: tempData?.dosage ? 'Добавлено через фото' : 'Добавлено вручную',
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

  await ctx.reply(`✅ *${name}* добавлен(о) в аптечку!`, { parse_mode: 'Markdown' });
  ctx.session.tempData = undefined;
}