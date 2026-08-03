import { Keyboard } from 'grammy';

export const mainKeyboard = new Keyboard()
  .text('💊 Справочник лекарств')
  .text('📦 Моя аптечка')
  .row()
  .text('📷 Добавить лекарство')
  .text('🩺 Назначение врача')
  .row()
  .text('👨‍👩‍👧‍👧 Семья')
  .text('📊 Отчёт по аптечке')
  .row()
  .text('🏥 Первая помощь')
  .text('⏰ Напоминания')
  ;