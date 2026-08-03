import { Composer } from 'grammy';
import type { BotContext } from '../../shared/types';
import { prisma } from '../../shared/database';

const composer = new Composer<BotContext>();

composer.on('message:text', async (ctx) => {
  if (ctx.session.awaitingInput !== 'symptom_search') return;

  const symptom = ctx.message.text.trim().toLowerCase();
  const telegramId = String(ctx.from?.id);

  const mappings = await prisma.symptomMedicineMapping.findMany({
    where: { symptom: { contains: symptom } },
    include: { medicine: true },
    orderBy: { priority: 'desc' },
    take: 5,
  });

  if (mappings.length === 0) {
    await ctx.reply(
      '🩺 По вашему симптому рекомендаций в базе пока нет.\n\n'
      + 'Рекомендуем:\n'
      + '• Обратиться к врачу\n'
      + '• Проверить справочник "💊 Справочник лекарств"\n'
      + '• Если есть назначение — отправьте через "🩺 Назначение врача"'
    );
    ctx.session.awaitingInput = undefined;
    return;
  }

  const user = await prisma.user.findUnique({
    where: { telegramId },
    include: {
      medicines: {
        include: { medicine: true },
        where: { expiryDate: { gt: new Date() } },
      },
    },
  });

  const userMedicineIds = new Set(user?.medicines.map((um) => um.medicineId) || []);
  const response: string[] = [`🩺 *Рекомендации при симптоме:* "${ctx.message.text}"\n`];

  for (const mapping of mappings) {
    const inKit = userMedicineIds.has(mapping.medicine.id);
    const status = inKit ? '✅ есть в аптечке' : '❌ нет в аптечке';
    response.push(`💊 *${mapping.medicine.name}* — ${status}`);
    if (mapping.medicine.dosage) {
      response.push(`   Дозировка: ${mapping.medicine.dosage}`);
    }
    if (mapping.source) {
      response.push(`   Источник: ${mapping.source}`);
    }
    response.push('');
  }

  response.push(
    '⚠️ *Важно:* Данные носят справочный характер. '
    + 'Перед применением проконсультируйтесь с врачом.'
  );

  await ctx.reply(response.join('\n'), { parse_mode: 'Markdown' });
  ctx.session.awaitingInput = undefined;
});

const symptomTriggers = ['🩺 Симптомы', 'симптом', 'болит', 'температура', 'кашель', 'насморк', 'головная боль'];

composer.hears(new RegExp(symptomTriggers.join('|'), 'i'), async (ctx) => {
  if (ctx.message?.text && !ctx.message.text.startsWith('/')) {
    ctx.session.awaitingInput = 'symptom_search';
    await ctx.reply('🩺 Опишите симптомы (например: "головная боль", "температура 38", "кашель"):');
  }
});

export function registerSymptomHandlers(bot: { use: (composer: Composer<BotContext>) => void }): void {
  bot.use(composer);
}