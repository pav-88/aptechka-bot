import { Composer, InlineKeyboard } from 'grammy';
import type { BotContext } from '../../shared/types';
import { prisma } from '../../shared/database';

const composer = new Composer<BotContext>();

composer.hears('🩺 Назначение врача', async (ctx) => {
  await ctx.reply(
    'Пришлите фото или текст назначения врача.\n\n'
    + 'Формат текстом:\n'
    + '`Диагноз | Лекарство1, дозировка, длительность | Лекарство2, дозировка, длительность`\n\n'
    + 'Или просто опишите текстом, я разберу.',
    { parse_mode: 'Markdown' },
  );
  ctx.session.awaitingInput = 'prescription';
});

composer.on(':photo', async (ctx) => {
  if (ctx.session.awaitingInput !== 'prescription') return;
  await ctx.reply(
    '📸 Фото назначения получено! Идёт распознавание...\n\n'
    + '⚠️ Распознавание фото пока в разработке.\n'
    + 'Пожалуйста, введите назначение текстом в формате:\n'
    + '`Диагноз | Лекарство, дозировка | Лекарство2, дозировка`',
    { parse_mode: 'Markdown' },
  );
});

composer.on('message:text', async (ctx) => {
  if (ctx.session.awaitingInput !== 'prescription') return;

  const text = ctx.message.text.trim();
  const telegramId = String(ctx.from?.id);

  const user = await prisma.user.findUnique({
    where: { telegramId },
    include: { familyMembers: true },
  });

  if (!user) return;

  if (user.familyMembers.length === 0) {
    await ctx.reply('Сначала настройте семью через "👨‍👩‍👧‍👧 Семья", чтобы я знал, для кого назначение.');
    ctx.session.awaitingInput = undefined;
    return;
  }

  const keyboard = new InlineKeyboard();
  for (const member of user.familyMembers) {
    keyboard.text(member.name, `presc_member:${member.id}`);
  }

  await ctx.reply('Для кого это назначение?', { reply_markup: keyboard });
  ctx.session.tempData = { prescriptionText: text };
});

composer.callbackQuery(/^presc_member:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const memberId = parseInt(ctx.match[1], 10);
  const text = ctx.session.tempData?.prescriptionText as string;

  if (!text) {
    await ctx.reply('Ошибка: данные назначения не найдены. Попробуйте снова.');
    ctx.session.awaitingInput = undefined;
    return;
  }

  const telegramId = String(ctx.from?.id);
  const user = await prisma.user.findUnique({ where: { telegramId } });
  if (!user) return;

  const member = await prisma.familyMember.findUnique({ where: { id: memberId } });
  if (!member) return;

  const diagnosis = text.includes('|') ? text.split('|')[0].trim() : null;
  const medicinesText = text.includes('|')
    ? text.split('|').slice(1).join('|')
    : text;

  const medicineLines = medicinesText.split('|').map((s) => s.trim()).filter(Boolean);

  const prescription = await prisma.prescription.create({
    data: {
      userId: user.id,
      familyMemberId: member.id,
      diagnosis,
      notes: text,
    },
  });

  const results: string[] = [];

  for (const line of medicineLines) {
    const parts = line.split(',').map((s) => s.trim());
    const medName = parts[0];
    const dosage = parts[1] || null;
    const duration = parts[2] || null;

    const medicine = await prisma.medicine.findFirst({
      where: { name: { contains: medName } },
    });

    const existing = medicine
      ? await prisma.userMedicine.findFirst({
          where: {
            userId: user.id,
            medicineId: medicine.id,
            expiryDate: { gt: new Date() },
          },
        })
      : null;

    const alt = medicine && !existing
      ? await prisma.medicine.findMany({
          where: {
            activeIngredient: medicine.activeIngredient,
            id: { not: medicine.id },
          },
          take: 3,
        })
      : [];

    await prisma.prescriptionItem.create({
      data: {
        prescriptionId: prescription.id,
        medicineId: medicine?.id || null,
        medicineName: medName,
        dosage,
        duration,
        isFound: !!existing,
        alternative: alt.length > 0 ? alt.map((a) => a.name).join(', ') : null,
      },
    });

    const status = existing
      ? `✅ *${medName}* — есть в аптечке (${existing.quantity} шт.)`
      : medicine
        ? `❌ *${medName}* — не найдено в аптечке`
        : `⚠️ *${medName}* — лекарство не найдено в базе`;

    results.push(status);

    if (alt.length > 0 && !existing) {
      results.push(`   Возможные аналоги: ${alt.map((a) => a.name).join(', ')}`);
    }
  }

  const header = diagnosis
    ? `🩺 *Назначение для ${member.name}*\n📋 *Диагноз:* ${diagnosis}\n\n`
    : `🩺 *Назначение для ${member.name}*\n\n`;

  await ctx.reply(header + results.join('\n'), { parse_mode: 'Markdown' });

  ctx.session.awaitingInput = undefined;
  ctx.session.tempData = undefined;
});

export function registerPrescriptionHandlers(bot: { use: (composer: Composer<BotContext>) => void }): void {
  bot.use(composer);
}