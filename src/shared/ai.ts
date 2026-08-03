import OpenAI from 'openai';
import { config } from '../config';

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

export async function recognizeMedicineFromPhoto(
  imageBase64: string,
  mimeType: string,
): Promise<MedicineOCRResult> {
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
  const data = JSON.parse(text);

  return {
    name: data.name || 'Неизвестно',
    expiryDate: data.expiry_date || data.expiryDate || null,
    quantity: data.quantity || null,
    dosage: data.dosage || null,
    activeIngredient: data.active_ingredient || data.activeIngredient || null,
    confidence: data.confidence || 'low',
  };
}

export async function parsePrescriptionFromPhoto(
  imageBase64: string,
  mimeType: string,
): Promise<PrescriptionParseResult> {
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
  const data = JSON.parse(text);

  return {
    diagnosis: data.diagnosis || null,
    medicines: (data.medicines || data.medications || []).map((m: { name?: string; dosage?: string; duration?: string; notes?: string; }) => ({
      name: m.name || 'Неизвестно',
      dosage: m.dosage || null,
      duration: m.duration || null,
      notes: m.notes || null,
    })),
  };
}

export async function suggestAnalogues(
  medicineName: string,
  activeIngredient: string | null,
): Promise<string[]> {
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
  const data = JSON.parse(text);
  return data.analogues || data.analogs || [];
}

export async function checkDrugInteraction(
  medicines: string[],
): Promise<string | null> {
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
}