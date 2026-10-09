import 'dotenv/config';
import { initSentry, Sentry } from './lib/sentry';
import { installServerLogCapture, pruneServerLogs } from './lib/serverLog';

initSentry();
installServerLogCapture();

import { createApp } from './app';
import { resumeCampaigns } from './lib/marketing';
import { startOpsBriefingScheduler } from './lib/opsBriefing';

process.on('uncaughtException', (err) => {
  console.error('uncaught exception', err);
  Sentry.captureException(err);
});

process.on('unhandledRejection', (reason) => {
  console.error('unhandled rejection', reason);
  Sentry.captureException(reason);
});

const PORT = Number(process.env.PORT ?? 3000);

const app = createApp();

app.listen(PORT, () => {
  console.log(`gas-monitor-backend listening on port ${PORT}`);
  // A deploy mid-send must not strand a campaign.
  const prune = () => pruneServerLogs().catch(() => undefined);
  void prune();
  setInterval(prune, 6 * 60 * 60 * 1000).unref();
  startOpsBriefingScheduler();
  resumeCampaigns().catch((err) => console.error('[marketing] resume failed', err));
});
