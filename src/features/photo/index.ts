import { Composer, InlineKeyboard } from 'grammy';
import type { BotContext } from '../../shared/types';
import { prisma } from '../../shared/database';
import { recognizeMedicineFromPhoto, parsePrescriptionFromPhoto } from '../../shared/ai';
import { config } from '../../config';
import { logger } from '../../shared/logger';

export const photoComposer = new Composer<BotContext>();

async function downloadPhotoAsBase64(ctx: BotContext): Promise<string | null> {
  const photo = ctx.message?.photo;
  if (!photo) return null;
  const largest = photo[photo.length - 1];
  const file = await ctx.api.getFile(largest.file_id);
  if (!file.file_path) return null;

  const url = `https://api.telegram.org/file/bot${config.botToken}/${file.file_path}`;
  const response = await fetch(url);
  const buffer = Buffer.from(await response.arrayBuffer());
  return buffer.toString('base64');
}

photoComposer.on(':photo', async (ctx) => {
  if (ctx.session.awaitingInput === 'add_medicine') {
    await handleMedicinePhoto(ctx);
    return;
  }
  if (ctx.session.awaitingInput === 'prescription') {
    await handlePrescriptionPhoto(ctx);
    return;
  }
});

async function handleMedicinePhoto(ctx: BotContext): Promise<void> {
  await ctx.reply('📸 Фото получено! Распознаю через DeepSeek...');
  try {
    const base64 = await downloadPhotoAsBase64(ctx);
    if (!base64) {
      await ctx.reply('Ошибка получения файла.');
      return;
    }

    const result = await recognizeMedicineFromPhoto(base64, 'image/jpeg');

    if (result.confidence === 'low' || !result.name || result.name === 'Неизвестно') {
      await ctx.reply('😕 Не удалось распознать. Введите вручную.');
      ctx.session.awaitingInput = 'add_medicine';
      return;
    }

    const keyboard = new InlineKeyboard()
      .text('✅ Всё верно', `ai_confirm:${encodeURIComponent(result.name)}:${result.expiryDate || ''}:${result.quantity || 0}`)
      .text('✏️ Исправить', 'ai_edit');

    await ctx.reply(
      `📷 *Распознано:*\n💊 *${result.name}*${result.dosage ? `\n💉 ${result.dosage}` : ''}${result.expiryDate ? `\n📅 ${result.expiryDate}` : ''}${result.quantity ? `\n🔢 ${result.quantity} шт.` : ''}`,
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
    logger.error('Photo', 'Medicine photo recognition failed', { error: String(err) });
    await ctx.reply('❌ Ошибка распознавания.');
    ctx.session.awaitingInput = 'add_medicine';
  }
}

async function handlePrescriptionPhoto(ctx: BotContext): Promise<void> {
  await ctx.reply('📸 Фото назначения получено! Распознаю...');
  try {
    const base64 = await downloadPhotoAsBase64(ctx);
    if (!base64) {
      await ctx.reply('Ошибка получения файла.');
      return;
    }

    const parsed = await parsePrescriptionFromPhoto(base64, 'image/jpeg');
    if (parsed.medicines.length === 0) {
      await ctx.reply('Не удалось распознать. Введите текстом.');
      return;
    }

    const text = [
      parsed.diagnosis ? `📋 *Диагноз:* ${parsed.diagnosis}` : '',
      ...parsed.medicines.map((m) => `• *${m.name}*${m.dosage ? ` — ${m.dosage}` : ''}`),
    ].filter(Boolean).join('\n');

    await ctx.reply(`📸 *Распознано:*\n\n${text}\n\nВсё верно?`, { parse_mode: 'Markdown' });

    ctx.session.tempData = { prescriptionParsed: parsed };

    const telegramId = String(ctx.from?.id);
    const userWithFamily = await prisma.user.findUnique({
      where: { telegramId },
      include: { familyMembers: true },
    });
    if (userWithFamily && userWithFamily.familyMembers.length > 0) {
      const kb = new InlineKeyboard();
      for (const member of userWithFamily.familyMembers) {
        kb.text(member.name, `presc_member:${member.id}`);
      }
      await ctx.reply('Для кого назначение?', { reply_markup: kb });
    } else {
      await ctx.reply('Сначала настройте семью.');
    }
  } catch (err) {
    logger.error('Photo', 'Prescription photo recognition failed', { error: String(err) });
    await ctx.reply('❌ Ошибка распознавания.');
  }
  ctx.session.awaitingInput = undefined;
}