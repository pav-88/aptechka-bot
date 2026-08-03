import { prisma } from './database';
import { logger } from './logger';

const ALL_MEDICINES = [
  { name: 'Парацетамол', dosage: '500 мг', activeIngredient: 'Парацетамол', category: 'Жаропонижающие', description: 'Жаропонижающее и болеутоляющее' },
  { name: 'Ибупрофен', dosage: '200 мг', activeIngredient: 'Ибупрофен', category: 'Противовоспалительные', description: 'Противовоспалительное, жаропонижающее' },
  { name: 'Нурофен', dosage: '200 мг', activeIngredient: 'Ибупрофен', category: 'Противовоспалительные', description: 'Обезболивающее' },
  { name: 'Нурофен Экспресс', dosage: '400 мг', activeIngredient: 'Ибупрофен', category: 'Противовоспалительные', description: 'Обезболивающее усиленное' },
  { name: 'Нурофен форте', dosage: '400 мг', activeIngredient: 'Ибупрофен', category: 'Противовоспалительные', description: 'Обезболивающее усиленное' },
  { name: 'Нурофен детский', dosage: '100 мг/5 мл', activeIngredient: 'Ибупрофен', category: 'Противовоспалительные', description: 'Детское жаропонижающее' },
  { name: 'Активированный уголь', dosage: '250 мг', activeIngredient: 'Активированный уголь', category: 'Сорбенты', description: 'При отравлениях' },
  { name: 'Смекта', dosage: '3 г', activeIngredient: 'Смектит диоктаэдрический', category: 'Сорбенты', description: 'При диарее' },
  { name: 'Лоперамид', dosage: '2 мг', activeIngredient: 'Лоперамид', category: 'Противодиарейные', description: 'При диарее' },
  { name: 'Цитрамон', dosage: '240 мг', activeIngredient: 'Кофеин+Парацетамол+Ацетилсалициловая кислота', category: 'Обезболивающие', description: 'От головной боли' },
  { name: 'Спазмалгон', dosage: '500 мг', activeIngredient: 'Метамизол натрия+Питофенон+Фенпивериний', category: 'Спазмолитики', description: 'При спазмах' },
  { name: 'Но-шпа', dosage: '40 мг', activeIngredient: 'Дротаверин', category: 'Спазмолитики', description: 'При спазмах' },
  { name: 'Но-шпа форте', dosage: '80 мг', activeIngredient: 'Дротаверин', category: 'Спазмолитики', description: 'При спазмах усиленная' },
  { name: 'Амоксициллин', dosage: '500 мг', activeIngredient: 'Амоксициллин', category: 'Антибиотики', description: 'Антибиотик широкого спектра' },
  { name: 'Супрастин', dosage: '25 мг', activeIngredient: 'Хлоропирамин', category: 'Антигистаминные', description: 'От аллергии' },
  { name: 'Цетиризин', dosage: '10 мг', activeIngredient: 'Цетиризин', category: 'Антигистаминные', description: 'От аллергии' },
  { name: 'Зодак', dosage: '10 мг', activeIngredient: 'Цетиризин', category: 'Антигистаминные', description: 'От аллергии' },
  { name: 'Зиртек', dosage: '10 мг', activeIngredient: 'Цетиризин', category: 'Антигистаминные', description: 'От аллергии' },
  { name: 'Панкреатин', dosage: '25 Ед', activeIngredient: 'Панкреатин', category: 'Ферменты', description: 'Для пищеварения' },
  { name: 'Мезим', dosage: '3500 Ед', activeIngredient: 'Панкреатин', category: 'Ферменты', description: 'Для пищеварения' },
  { name: 'Креон', dosage: '10000 Ед', activeIngredient: 'Панкреатин', category: 'Ферменты', description: 'Для пищеварения' },
  { name: 'Ренгалин', dosage: 'таблетки', activeIngredient: 'Антитела к брадикинину', category: 'От кашля', description: 'Противокашлевое' },
  { name: 'Гексорал', dosage: '0.1%', activeIngredient: 'Гексэтидин', category: 'Антисептики', description: 'Для горла' },
  { name: 'Мирамистин', dosage: '0.01%', activeIngredient: 'Мирамистин', category: 'Антисептики', description: 'Антисептик' },
  { name: 'Перекись водорода', dosage: '3%', activeIngredient: 'Перекись водорода', category: 'Антисептики', description: 'Для обработки ран' },
  { name: 'Бинт стерильный', dosage: null, activeIngredient: null, category: 'Перевязочные', description: 'Стерильный бинт' },
  { name: 'Пластырь', dosage: null, activeIngredient: null, category: 'Перевязочные', description: 'Бактерицидный пластырь' },
  { name: 'Йод', dosage: '5%', activeIngredient: 'Йод', category: 'Антисептики', description: 'Для обработки ран' },
  { name: 'Зелёнка', dosage: '1%', activeIngredient: 'Бриллиантовый зелёный', category: 'Антисептики', description: 'Для обработки ран' },
  { name: 'Валидол', dosage: '60 мг', activeIngredient: 'Левоментол', category: 'Сердечно-сосудистые', description: 'При болях в сердце' },
  { name: 'Корвалол', dosage: 'капли', activeIngredient: 'Фенобарбитал+Этилбромизовалерианат', category: 'Седативные', description: 'Успокаивающее' },
  { name: 'Анальгин', dosage: '500 мг', activeIngredient: 'Метамизол натрия', category: 'Обезболивающие', description: 'Обезболивающее' },
  { name: 'Нимесил', dosage: '100 мг', activeIngredient: 'Нимесулид', category: 'Противовоспалительные', description: 'Обезболивающее и противовоспалительное' },
  { name: 'Найз', dosage: '100 мг', activeIngredient: 'Нимесулид', category: 'Противовоспалительные', description: 'Обезболивающее' },
  { name: 'Кеторол', dosage: '10 мг', activeIngredient: 'Кеторолак', category: 'Обезболивающие', description: 'Сильное обезболивающее' },
  { name: 'Диклофенак', dosage: '50 мг', activeIngredient: 'Диклофенак', category: 'Противовоспалительные', description: 'Противовоспалительное' },
  { name: 'Омепразол', dosage: '20 мг', activeIngredient: 'Омепразол', category: 'Желудочно-кишечные', description: 'От изжоги и гастрита' },
  { name: 'Эссенциале', dosage: '300 мг', activeIngredient: 'Фосфолипиды', category: 'Гепатопротекторы', description: 'Для печени' },
  { name: 'Карсил', dosage: '35 мг', activeIngredient: 'Силимарин', category: 'Гепатопротекторы', description: 'Для печени' },
  { name: 'Мелоксикам', dosage: '15 мг', activeIngredient: 'Мелоксикам', category: 'Противовоспалительные', description: 'При болях в суставах' },
];

export async function seedMedicineCatalog(): Promise<void> {
  const count = await prisma.medicine.count();
  if (count === ALL_MEDICINES.length) {
    return;
  }

  logger.info('Seed', `Medicine catalog: ${count} records, need ${ALL_MEDICINES.length} — deleting all and re-seeding`);

  await prisma.medicine.deleteMany();

  for (const m of ALL_MEDICINES) {
    await prisma.medicine.create({ data: m });
  }

  logger.info('Seed', `Seeded ${ALL_MEDICINES.length} medicines`);
}