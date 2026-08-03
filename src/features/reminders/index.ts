import { Composer, InlineKeyboard } from 'grammy';
import type { BotContext } from '../../shared/types';
import { prisma } from '../../shared/database';

export const remindersComposer = new Composer<BotContext>();

remindersComposer.hears('⏰ Напоминания', async (ctx) => {
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
    await ctx.reply('⏰ Нет активных напоминаний.');
    return;
  }
  const list = user.reminders
    .map((r) => {
      const member = r.familyMember ? ` (${r.familyMember.name})` : '';
      return `• *${r.medicine.name}*${member}`;
    })
    .join('\n');
  await ctx.reply(`⏰ *Напоминания:*\n\n${list}`, { parse_mode: 'Markdown' });
});

remindersComposer.callbackQuery(/^remind_keep:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery('✅ Напоминание остаётся активным.');
});

remindersComposer.callbackQuery(/^remind_stop:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const userMedicineId = parseInt(ctx.match[1], 10);
  const telegramId = String(ctx.from?.id);
  const user = await prisma.user.findUnique({ where: { telegramId } });
  if (!user) return;

  const userMedicine = await prisma.userMedicine.findUnique({
    where: { id: userMedicineId },
    include: { medicine: true },
  });
  if (!userMedicine || userMedicine.userId !== user.id) return;

  const confirmKeyboard = new InlineKeyboard()
    .text('✅ Да, отключить', `remind_confirm_stop:${userMedicineId}`)
    .text('❌ Нет', 'remind_cancel_stop');

  await ctx.reply(
    `Вы уверены, что хотите отключить напоминание о *${userMedicine.medicine.name}*?`,
    { parse_mode: 'Markdown', reply_markup: confirmKeyboard },
  );
});

remindersComposer.callbackQuery(/^remind_confirm_stop:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const userMedicineId = parseInt(ctx.match[1], 10);
  const telegramId = String(ctx.from?.id);
  const user = await prisma.user.findUnique({ where: { telegramId } });
  if (!user) return;

  const userMedicine = await prisma.userMedicine.findUnique({
    where: { id: userMedicineId },
    include: { medicine: true },
  });
  if (!userMedicine || userMedicine.userId !== user.id) return;

  await prisma.reminder.deleteMany({
    where: { userId: user.id, medicineId: userMedicine.medicineId },
  });

  await ctx.reply(`⏰ Напоминание о *${userMedicine.medicine.name}* отключено.`, { parse_mode: 'Markdown' });
});

remindersComposer.callbackQuery('remind_cancel_stop', async (ctx) => {
  await ctx.answerCallbackQuery('✅ Напоминание сохранено.');
});