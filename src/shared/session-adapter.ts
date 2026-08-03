import { prisma } from './database';
import { logger } from './logger';

const KEY_PREFIX = 'grammy:session:';

function buildKey(userId: number, chatId: number): string {
  return `${KEY_PREFIX}${userId}:${chatId}`;
}

export function prismaSessionAdapter<S extends Record<string, unknown>>() {
  return {
    async read(key: string): Promise<S | undefined> {
      try {
        const record = await prisma.session.findUnique({
          where: { key },
        });
        if (!record) return undefined;

        try {
          return JSON.parse(record.data) as S;
        } catch {
          logger.warn('Session', `Failed to parse session data for key ${key}, resetting`);
          return undefined;
        }
      } catch (err) {
        logger.error('Session', `Failed to read session for key ${key}`, { error: String(err) });
        return undefined;
      }
    },

    async write(key: string, data: S): Promise<void> {
      const serialized = JSON.stringify(data);

      try {
        const user = await prisma.user.findUnique({
          where: { telegramId: key },
        });
        if (!user) {
          logger.debug('Session', `User not found for session key ${key}, creating placeholder`);
          return;
        }

        await prisma.session.upsert({
          where: { key },
          update: { data: serialized },
          create: {
            key,
            data: serialized,
            userId: user.id,
          },
        });
      } catch (err) {
        logger.error('Session', `Failed to write session for key ${key}`, { error: String(err) });
      }
    },

    async delete(key: string): Promise<void> {
      try {
        await prisma.session.delete({ where: { key } }).catch(() => {});
      } catch (err) {
        logger.error('Session', `Failed to delete session for key ${key}`, { error: String(err) });
      }
    },
  };
}

export { buildKey };