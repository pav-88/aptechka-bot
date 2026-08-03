console.log('[Aptechka] Starting bot...');

import { startBot } from './bot';

startBot().catch((err) => {
  console.error('[Aptechka] Fatal:', err);
  process.exit(1);
});