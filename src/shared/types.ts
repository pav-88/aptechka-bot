import { Context, SessionFlavor } from 'grammy';

export interface SessionData {
  familyMemberId?: number;
  awaitingInput?: string;
  tempData?: Record<string, unknown>;
}

export type BotContext = Context & SessionFlavor<SessionData>;

export interface MedicineSearchResult {
  id: number;
  name: string;
  description: string | null;
  dosage: string | null;
  activeIngredient: string | null;
  category: string | null;
}