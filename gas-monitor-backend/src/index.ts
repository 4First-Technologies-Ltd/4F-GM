import 'dotenv/config';
import { initSentry, Sentry } from './lib/sentry';

initSentry();

import { createApp } from './app';

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
});
