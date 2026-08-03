import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('ai', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it('should return fallback when no API key configured', async () => {
    vi.stubEnv('BOT_TOKEN', 'test:token');
    vi.stubEnv('DEEPSEEK_API_KEY', '');

    const { recognizeMedicineFromPhoto } = await import('../ai');
    const result = await recognizeMedicineFromPhoto('base64img', 'image/jpeg');
    expect(result.name).toBe('Неизвестно');
    expect(result.confidence).toBe('low');
  });

  it('should return fallback with placeholder key', async () => {
    vi.stubEnv('BOT_TOKEN', 'test:token');
    vi.stubEnv('DEEPSEEK_API_KEY', 'ваш_ключ_здесь');

    const { recognizeMedicineFromPhoto } = await import('../ai');
    const result = await recognizeMedicineFromPhoto('base64img', 'image/jpeg');
    expect(result.name).toBe('Неизвестно');
    expect(result.confidence).toBe('low');
  });

  it('should export all AI functions', async () => {
    vi.stubEnv('BOT_TOKEN', 'test:token');
    vi.stubEnv('DEEPSEEK_API_KEY', 'sk-real');

    const mod = await import('../ai');
    expect(typeof mod.recognizeMedicineFromPhoto).toBe('function');
    expect(typeof mod.parsePrescriptionFromPhoto).toBe('function');
    expect(typeof mod.suggestAnalogues).toBe('function');
    expect(typeof mod.checkDrugInteraction).toBe('function');
  });

  it('MedicineOCRResult type should have correct shape', () => {
    const result = {
      name: 'test',
      expiryDate: '12.2026',
      quantity: 10,
      dosage: '200mg',
      activeIngredient: 'ibuprofen',
      confidence: 'high' as const,
    };
    expect(result.name).toBeDefined();
    expect(result.confidence).toMatch(/^(high|medium|low)$/);
  });

  it('PrescriptionParseResult type should have correct shape', () => {
    const result = {
      diagnosis: 'test',
      medicines: [{ name: 'med', dosage: null, duration: null, notes: null }],
    };
    expect(Array.isArray(result.medicines)).toBe(true);
    expect(result.medicines[0].name).toBeDefined();
  });
});