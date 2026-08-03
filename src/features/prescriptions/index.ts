import { Composer, InlineKeyboard } from 'grammy';
import type { BotContext } from '../../shared/types';
import { prisma } from '../../shared/database';
import { suggestAnalogues, checkDrugInteraction } from '../../shared/ai';

export const prescriptionsComposer = new Composer<BotContext>();

prescriptionsComposer.hears('🩺 Назначение врача', async (ctx) => {
  await ctx.reply('Пришлите фото или текст назначения врача.', { parse_mode: 'Markdown' });
  ctx.session.awaitingInput = 'prescription';
});

prescriptionsComposer.callbackQuery(/^presc_member:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const memberId = parseInt(ctx.match[1], 10);
  const rawData = ctx.session.tempData;
  const parsedPrescription = rawData?.prescriptionParsed as
    | { diagnosis?: string | null; medicines: Array<{ name: string; dosage?: string | null; duration?: string | null }> }
    | undefined;
  const rawText = rawData?.prescriptionText as string | undefined;

  const telegramId = String(ctx.from?.id);
  const user = await prisma.user.findUnique({ where: { telegramId } });
  if (!user) return;
  const member = await prisma.familyMember.findUnique({ where: { id: memberId } });
  if (!member) return;

  let diagnosis: string | null = null;
  let medicines: Array<{ name: string; dosage: string | null; duration: string | null }> = [];

  if (parsedPrescription && !rawText) {
    diagnosis = parsedPrescription.diagnosis || null;
    medicines = parsedPrescription.medicines.map((m) => ({
      name: m.name,
      dosage: m.dosage || null,
      duration: m.duration || null,
    }));
  } else if (rawText) {
    diagnosis = rawText.includes('|') ? rawText.split('|')[0].trim() : null;
    const medsText = rawText.includes('|') ? rawText.split('|').slice(1).join('|') : rawText;
    medicines = medsText
      .split('|')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((line) => {
        const parts = line.split(',').map((p) => p.trim());
        return { name: parts[0], dosage: parts[1] || null, duration: parts[2] || null };
      });
  }

  const prescription = await prisma.prescription.create({
    data: { userId: user.id, familyMemberId: member.id, diagnosis, notes: rawText || '' },
  });

  const results: string[] = [`🩺 *Назначение для ${member.name}*`, diagnosis ? `📋 *Диагноз:* ${diagnosis}` : '', ''];
  const allMedNames: string[] = [];

  for (const med of medicines) {
    allMedNames.push(med.name);
    const medicine = await prisma.medicine.findFirst({ where: { name: { contains: med.name } } });
    const existing = medicine
      ? await prisma.userMedicine.findFirst({
          where: { userId: user.id, medicineId: medicine.id, expiryDate: { gt: new Date() } },
        })
      : null;

    let alternatives: string[] = [];
    if (!existing && medicine) {
      const fromDb = await prisma.medicine.findMany({
        where: { activeIngredient: medicine.activeIngredient, id: { not: medicine.id } },
        take: 3,
      });
      alternatives = fromDb.map((a) => a.name);
      if (alternatives.length === 0) {
        try {
          alternatives = await suggestAnalogues(med.name, medicine.activeIngredient);
        } catch {
          /* empty */
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
      ? `✅ *${med.name}* — есть (${existing.quantity} шт.)`
      : medicine
        ? `❌ *${med.name}* — нет в аптечке`
        : `⚠️ *${med.name}* — нет в базе`;
    results.push(status);
    if (alternatives.length > 0 && !existing) results.push(`   🔄 Аналоги: ${alternatives.join(', ')}`);
  }

  if (allMedNames.length >= 2) {
    try {
      const interaction = await checkDrugInteraction(allMedNames);
      if (interaction) results.push('', `---\n🔬 *Совместимость:*\n${interaction}`);
    } catch {
      /* skip */
    }
  }

  await ctx.reply(results.join('\n'), { parse_mode: 'Markdown' });
  ctx.session.awaitingInput = undefined;
  ctx.session.tempData = undefined;
});

