import { Composer, InlineKeyboard } from 'grammy';
import type { BotContext } from '../../shared/types';
import { prisma } from '../../shared/database';
import { parsePrescriptionFromPhoto, suggestAnalogues, checkDrugInteraction } from '../../shared/ai';

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

  await ctx.reply('📸 Фото назначения получено! Распознаю через DeepSeek...');

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

    const parsed = await parsePrescriptionFromPhoto(base64, 'image/jpeg');

    if (parsed.medicines.length === 0) {
      await ctx.reply(
        '😕 Не удалось распознать лекарства в назначении.\n\n'
        + 'Пожалуйста, введите текст назначения вручную.'
      );
      ctx.session.awaitingInput = undefined;
      return;
    }

    const text = [
      parsed.diagnosis ? `📋 *Диагноз:* ${parsed.diagnosis}\n` : '',
      ...parsed.medicines.map((m) => `• *${m.name}*${m.dosage ? ` — ${m.dosage}` : ''}${m.duration ? ` (${m.duration})` : ''}`),
    ].filter(Boolean).join('\n');

    const keyboard = new InlineKeyboard().text('✅ Всё верно', 'presc_ai_confirm');

    await ctx.reply(
      `📸 *Распознанное назначение:*\n\n${text}\n\n`
      + `Всё верно? Если нет — напишите текст вручную.`,
      { parse_mode: 'Markdown', reply_markup: keyboard },
    );

    ctx.session.tempData = { prescriptionParsed: parsed };
  } catch (err) {
    console.error('Prescription OCR error:', err);
    await ctx.reply(
      '❌ Ошибка распознавания. Пожалуйста, введите назначение текстом '
      + 'в формате: `Диагноз | Лекарство, дозировка | Лекарство2, дозировка`',
      { parse_mode: 'Markdown' },
    );
  }
});

composer.callbackQuery('presc_ai_confirm', async (ctx) => {
  await ctx.answerCallbackQuery();
  const parsed = ctx.session.tempData?.prescriptionParsed as { diagnosis?: string | null; medicines: Array<{ name: string; dosage?: string | null; duration?: string | null; notes?: string | null }> } | undefined;

  if (!parsed) {
    await ctx.reply('Ошибка: данные не найдены.');
    return;
  }

  const telegramId = String(ctx.from?.id);
  const user = await prisma.user.findUnique({
    where: { telegramId },
    include: { familyMembers: true },
  });

  if (!user) return;

  if (user.familyMembers.length === 0) {
    await ctx.reply('Сначала настройте семью через "👨‍👩‍👧‍👧 Семья".');
    ctx.session.awaitingInput = undefined;
    return;
  }

  const keyboard = new InlineKeyboard();
  for (const member of user.familyMembers) {
    keyboard.text(member.name, `presc_member:${member.id}`);
  }

  await ctx.reply('Для кого это назначение?', { reply_markup: keyboard });
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
  ctx.session.tempData = { ...ctx.session.tempData, prescriptionText: text };
});

composer.callbackQuery(/^presc_member:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const memberId = parseInt(ctx.match[1], 10);

  const rawData = ctx.session.tempData;
  const parsedPrescription = rawData?.prescriptionParsed as { diagnosis?: string | null; medicines: Array<{ name: string; dosage?: string | null; duration?: string | null; notes?: string | null }> } | undefined;
  const rawText = rawData?.prescriptionText as string | undefined;

  const telegramId = String(ctx.from?.id);
  const user = await prisma.user.findUnique({ where: { telegramId } });
  if (!user) return;

  const member = await prisma.familyMember.findUnique({ where: { id: memberId } });
  if (!member) return;

  let diagnosis: string | null = null;
  let medicines: Array<{ name: string; dosage: string | null; duration: string | null }> = [];

  if (parsedPrescription && rawText !== undefined) {
    // Текстовый ввод + AI распознал — используем текстовый
    diagnosis = rawText.includes('|') ? rawText.split('|')[0].trim() : null;
    const medsText = rawText.includes('|') ? rawText.split('|').slice(1).join('|') : rawText;
    medicines = medsText.split('|').map((s) => s.trim()).filter(Boolean).map((line) => {
      const parts = line.split(',').map((p) => p.trim());
      return { name: parts[0], dosage: parts[1] || null, duration: parts[2] || null };
    });
  } else if (parsedPrescription) {
    // AI распознал с фото
    diagnosis = parsedPrescription.diagnosis || null;
    medicines = parsedPrescription.medicines.map((m) => ({
      name: m.name,
      dosage: m.dosage || null,
      duration: m.duration || null,
    }));
  } else if (rawText) {
    // Только текст, без AI
    diagnosis = rawText.includes('|') ? rawText.split('|')[0].trim() : null;
    const medsText = rawText.includes('|') ? rawText.split('|').slice(1).join('|') : rawText;
    medicines = medsText.split('|').map((s) => s.trim()).filter(Boolean).map((line) => {
      const parts = line.split(',').map((p) => p.trim());
      return { name: parts[0], dosage: parts[1] || null, duration: parts[2] || null };
    });
  } else {
    await ctx.reply('Ошибка: данные назначения не найдены.');
    ctx.session.awaitingInput = undefined;
    return;
  }

  const prescription = await prisma.prescription.create({
    data: {
      userId: user.id,
      familyMemberId: member.id,
      diagnosis,
      notes: rawText || parsedPrescription?.medicines.map((m) => m.name).join(', ') || '',
    },
  });

  const results: string[] = [
    `🩺 *Назначение для ${member.name}*`,
    diagnosis ? `📋 *Диагноз:* ${diagnosis}` : '',
    '',
  ].filter(Boolean);

  const allMedNames: string[] = [];

  for (const med of medicines) {
    allMedNames.push(med.name);

    const medicine = await prisma.medicine.findFirst({
      where: { name: { contains: med.name } },
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

    let alternatives: string[] = [];

    if (!existing) {
      const fromDb = medicine && !existing
        ? await prisma.medicine.findMany({
            where: {
              activeIngredient: medicine.activeIngredient,
              id: { not: medicine.id },
            },
            take: 3,
          })
        : [];

      if (fromDb.length > 0) {
        alternatives = fromDb.map((a) => a.name);
      } else if (medicine) {
        try {
          alternatives = await suggestAnalogues(med.name, medicine.activeIngredient);
        } catch {
          alternatives = [];
        }
      }
    }

    await prisma.prescriptionItem.create({
      data: {
        prescriptionId: prescription.id,
        medicineId: medicine?.id || null,
        medicineName: med.name,
        dosage: med.dosage,
        duration: med.duration,
        isFound: !!existing,
        alternative: alternatives.length > 0 ? alternatives.join(', ') : null,
      },
    });

    const status = existing
      ? `✅ *${med.name}* — есть в аптечке (${existing.quantity} шт.)`
      : medicine
        ? `❌ *${med.name}* — не найдено в аптечке`
        : `⚠️ *${med.name}* — нет в базе`;

    results.push(status);

    if (alternatives.length > 0 && !existing) {
      results.push(`   🔄 Возможные аналоги: ${alternatives.join(', ')}`);
    }
  }

  if (allMedNames.length >= 2) {
    try {
      await ctx.reply('🔍 Проверяю совместимость лекарств...');
      const interaction = await checkDrugInteraction(allMedNames);
      if (interaction) {
        results.push('', `---\n🔬 *Совместимость:*\n${interaction}`);
      }
    } catch {
      // Если AI не отвечает — пропускаем проверку совместимости
    }
  }

  await ctx.reply(results.join('\n'), { parse_mode: 'Markdown' });

  ctx.session.awaitingInput = undefined;
  ctx.session.tempData = undefined;
});

export function registerPrescriptionHandlers(bot: { use: (composer: Composer<BotContext>) => void }): void {
  bot.use(composer);
}