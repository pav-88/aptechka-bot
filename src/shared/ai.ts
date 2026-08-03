import OpenAI from 'openai';
import { config } from '../config';
import { logger } from './logger';

let aiClient: OpenAI | null = null;

const DEEPSEEK_BASE_URL = 'https://api.deepseek.com/v1';

function getClient(): OpenAI {
  if (!aiClient) {
    if (!config.deepseekApiKey || config.deepseekApiKey === 'ваш_ключ_здесь') {
      throw new Error('DeepSeek API ключ не настроен. Добавьте DEEPSEEK_API_KEY в .env');
    }
    aiClient = new OpenAI({
      baseURL: DEEPSEEK_BASE_URL,
      apiKey: config.deepseekApiKey,
      timeout: 10_000,
      maxRetries: 0,
    });
  }
  return aiClient;
}

export interface MedicineOCRResult {
  name: string;
  expiryDate: string | null;
  quantity: number | null;
  dosage: string | null;
  activeIngredient: string | null;
  confidence: 'high' | 'medium' | 'low';
}

export interface PrescriptionParseResult {
  diagnosis: string | null;
  medicines: Array<{
    name: string;
    dosage: string | null;
    duration: string | null;
    notes: string | null;
  }>;
}

async function safeJsonParse<T>(text: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(text) as T;
  } catch {
    logger.warn('AI', 'Failed to parse AI response JSON', { text: text.slice(0, 200) });
    return fallback;
  }
}

async function withErrorHandling<T>(fn: () => Promise<T>, fallback: T, operation: string): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    logger.error('AI', `Operation failed: ${operation}`, { error: err instanceof Error ? err.message : String(err) });
    return fallback;
  }
}

export async function recognizeMedicineFromPhoto(
  imageBase64: string,
  mimeType: string,
): Promise<MedicineOCRResult> {
  return withErrorHandling(async () => {
    const client = getClient();

    const response = await client.chat.completions.create({
      model: 'deepseek-chat',
      messages: [
        {
          role: 'system',
          content: 'Ты — ассистент для распознавания лекарств. '
            + 'По фотографии упаковки лекарства определи: '
            + 'название, срок годности (формат ДД.ММ.ГГГГ), количество, дозировку, действующее вещество. '
            + 'Верни ТОЛЬКО JSON без пояснений.',
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Что это за лекарство? Распознай все данные.' },
            {
              type: 'image_url',
              image_url: { url: `data:${mimeType};base64,${imageBase64}` },
            },
          ],
        },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 500,
    });

    const text = response.choices[0]?.message?.content || '{}';
    const data = await safeJsonParse<Record<string, unknown>>(text, {});

    return {
      name: typeof data.name === 'string' ? data.name : 'Неизвестно',
      expiryDate: typeof data.expiry_date === 'string' ? data.expiry_date : (typeof data.expiryDate === 'string' ? data.expiryDate : null),
      quantity: typeof data.quantity === 'number' ? data.quantity : null,
      dosage: typeof data.dosage === 'string' ? data.dosage : null,
      activeIngredient: typeof data.active_ingredient === 'string' ? data.active_ingredient : (typeof data.activeIngredient === 'string' ? data.activeIngredient : null),
      confidence: ['high', 'medium', 'low'].includes(String(data.confidence)) ? data.confidence as 'high' | 'medium' | 'low' : 'low',
    };
  }, {
    name: 'Неизвестно',
    expiryDate: null,
    quantity: null,
    dosage: null,
    activeIngredient: null,
    confidence: 'low' as const,
  }, 'recognizeMedicineFromPhoto');
}

export async function parsePrescriptionFromPhoto(
  imageBase64: string,
  mimeType: string,
): Promise<PrescriptionParseResult> {
  return withErrorHandling(async () => {
    const client = getClient();

    const response = await client.chat.completions.create({
      model: 'deepseek-chat',
      messages: [
        {
          role: 'system',
          content: 'Ты — ассистент для разбора медицинских назначений и рецептов. '
            + 'По фотографии или тексту назначения определи: '
            + 'диагноз, список лекарств (название, дозировка, длительность, примечания). '
            + 'Верни ТОЛЬКО JSON без пояснений.',
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Разбери это назначение врача.' },
            {
              type: 'image_url',
              image_url: { url: `data:${mimeType};base64,${imageBase64}` },
            },
          ],
        },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 1000,
    });

    const text = response.choices[0]?.message?.content || '{}';
    const data = await safeJsonParse<Record<string, unknown>>(text, {});

    const medicines = Array.isArray(data.medicines) ? data.medicines : (Array.isArray(data.medications) ? data.medications : []);

    return {
      diagnosis: typeof data.diagnosis === 'string' ? data.diagnosis : null,
      medicines: medicines.map((m: Record<string, unknown>) => ({
        name: typeof m.name === 'string' ? m.name : 'Неизвестно',
        dosage: typeof m.dosage === 'string' ? m.dosage : null,
        duration: typeof m.duration === 'string' ? m.duration : null,
        notes: typeof m.notes === 'string' ? m.notes : null,
      })),
    };
  }, { diagnosis: null, medicines: [] }, 'parsePrescriptionFromPhoto');
}

export async function suggestAnalogues(
  medicineName: string,
  activeIngredient: string | null,
): Promise<string[]> {
  return withErrorHandling(async () => {
    const client = getClient();

    const response = await client.chat.completions.create({
      model: 'deepseek-chat',
      messages: [
        {
          role: 'system',
          content: 'Ты — фармацевтический консультант. '
            + 'По названию лекарства или действующему веществу предложи до 3 аналогов. '
            + 'Учитывай действующее вещество. '
            + 'Верни ТОЛЬКО массив названий в JSON: {"analogues": ["..."]}',
        },
        {
          role: 'user',
          content: `Найди аналоги для: ${medicineName}${activeIngredient ? ` (действующее вещество: ${activeIngredient})` : ''}`,
        },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 300,
    });

    const text = response.choices[0]?.message?.content || '{}';
    const data = await safeJsonParse<Record<string, unknown>>(text, {});
    const analogues = Array.isArray(data.analogues) ? data.analogues : (Array.isArray(data.analogs) ? data.analogs : []);
    return analogues.map(String);
  }, [], 'suggestAnalogues');
}

export async function checkDrugInteraction(
  medicines: string[],
): Promise<string | null> {
  return withErrorHandling(async () => {
    const client = getClient();

    const response = await client.chat.completions.create({
      model: 'deepseek-chat',
      messages: [
        {
          role: 'system',
          content: 'Ты — фармацевтический консультант. '
            + 'Проверь список лекарств на нежелательные взаимодействия. '
            + 'Ссылайся на рекомендации ВОЗ и клинические исследования. '
            + 'Если всё безопасно — напиши "Совместимость не вызывает опасений." '
            + 'Если есть риски — опиши их конкретно. '
            + '⚠️ Важно: ты даёшь справочную информацию, окончательное решение за врачом.',
        },
        {
          role: 'user',
          content: `Проверь совместимость: ${medicines.join(', ')}`,
        },
      ],
      max_tokens: 500,
    });

    return response.choices[0]?.message?.content || null;
  }, null, 'checkDrugInteraction');
}

export async function getMedicineDescription(
  medicineName: string,
): Promise<string | null> {
  return withErrorHandling(async () => {
    const client = getClient();

    const response = await client.chat.completions.create({
      model: 'deepseek-chat',
      messages: [
        {
          role: 'system',
          content: 'Ты — фармацевтический справочник. '
            + 'По названию лекарства кратко опиши: для чего применяется, как принимать, основные противопоказания. '
            + 'Ответ дай на русском, 3-5 предложений. Без форматирования JSON, просто текст.',
        },
        {
          role: 'user',
          content: `Расскажи о лекарстве: ${medicineName}`,
        },
      ],
      max_tokens: 500,
    });

    return response.choices[0]?.message?.content || null;
  }, null, 'getMedicineDescription');
}