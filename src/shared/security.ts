import { config } from '../config';
import OpenAI from 'openai';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateConfig(): ValidationResult {
  const result: ValidationResult = { valid: true, errors: [], warnings: [] };

  if (!config.deepseekApiKey) {
    result.warnings.push('DEEPSEEK_API_KEY is not set — AI features (photo recognition, prescription parsing) will not work');
  } else if (config.deepseekApiKey === 'ваш_ключ_здесь') {
    result.warnings.push('DEEPSEEK_API_KEY has placeholder value — AI features disabled');
  }

  return result;
}

export async function validateDeepSeekToken(): Promise<boolean> {
  if (!config.deepseekApiKey || config.deepseekApiKey === 'ваш_ключ_здесь') return false;

  try {
    const client = new OpenAI({
      baseURL: 'https://api.deepseek.com/v1',
      apiKey: config.deepseekApiKey,
      timeout: 5000,
      maxRetries: 0,
    });

    await client.models.list();
    return true;
  } catch {
    return false;
  }
}