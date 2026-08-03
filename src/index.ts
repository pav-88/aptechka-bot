import { logger } from './shared/logger';

logger.info('Aptechka', 'Starting bot...');

import { startBot } from './bot';

startBot().catch((err) => {
  logger.error('Aptechka', 'Fatal error during startup', { error: String(err) });
  process.exit(1);
});