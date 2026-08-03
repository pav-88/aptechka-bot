import { describe, it, expect, vi } from 'vitest';

describe('keyboard', () => {
  it('should export mainKeyboard', async () => {
    vi.stubEnv('BOT_TOKEN', 'test:token');
    const { mainKeyboard } = await import('../keyboard');

    const json = JSON.stringify(mainKeyboard);
    const parsed = JSON.parse(json);

    expect(parsed).toHaveProperty('keyboard');
    expect(parsed.keyboard).toHaveLength(4);

    const allButtons = parsed.keyboard.flat().map((b: { text: string }) => b.text);
    expect(allButtons).toContain('💊 Справочник лекарств');
    expect(allButtons).toContain('📦 Моя аптечка');
    expect(allButtons).toContain('📷 Добавить лекарство');
    expect(allButtons).toContain('🩺 Назначение врача');
    expect(allButtons).toContain('👨‍👩‍👧‍👧 Семья');
    expect(allButtons).toContain('📊 Отчёт по аптечке');
    expect(allButtons).toContain('🏥 Первая помощь');
    expect(allButtons).toContain('⏰ Напоминания');
    expect(allButtons).toHaveLength(8);
  });

  it('should have 2 buttons per row', async () => {
    vi.stubEnv('BOT_TOKEN', 'test:token');
    const { mainKeyboard } = await import('../keyboard');
    const json = JSON.parse(JSON.stringify(mainKeyboard));
    for (const row of json.keyboard) {
      expect(row).toHaveLength(2);
    }
  });
});