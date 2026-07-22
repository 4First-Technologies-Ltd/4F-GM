import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';

import authRoutes from './routes/auth';
import vendorRoutes from './routes/vendor';
import ordersRoutes from './routes/orders';
import cylindersRoutes from './routes/cylinders';
import addressesRoutes from './routes/addresses';
import analyticsRoutes from './routes/analytics';
import contactRoutes from './routes/contact';
import { paystackWebhookHandler } from './routes/ordersWebhook';
import { sentryWebhookHandler } from './routes/internalSentryWebhook';
import { Sentry } from './lib/sentry';

import adminAuthRoutes from './routes/admin/auth';
import adminAdminUsersRoutes from './routes/admin/adminUsers';
import adminAnalyticsRoutes from './routes/admin/analytics';
import adminCustomersRoutes from './routes/admin/customers';
import adminListingsRoutes from './routes/admin/listings';
import adminOrdersRoutes from './routes/admin/orders';
import adminSettingsRoutes from './routes/admin/settings';
import adminStatsRoutes from './routes/admin/stats';
import adminUsersRoutes from './routes/admin/users';
import adminVendorsRoutes from './routes/admin/vendors';

const corsOrigins = (process.env.CORS_ORIGINS ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin: corsOrigins.length > 0 ? corsOrigins : true,
      credentials: true
    })
  );
  app.use(cookieParser());

  // Paystack webhook needs the raw request body for HMAC verification —
  // must be registered before the global express.json() body parser.
  app.post('/api/orders/webhook', express.raw({ type: 'application/json' }), paystackWebhookHandler);

  // Sentry's issue-alert webhook — same raw-body-for-signature-verification need as above.
  app.post('/api/internal/sentry-webhook', express.raw({ type: 'application/json' }), sentryWebhookHandler);

  app.use(express.json());

  app.get('/health', (_req, res) => res.json({ ok: true }));

  // Consumer / vendor API — paths unchanged from gas-monitor-web so the
  // mobile app only needs to repoint API_BASE_URL.
  app.use('/api/auth', authRoutes);
  app.use('/api/vendor', vendorRoutes);
  app.use('/api/orders', ordersRoutes);
  app.use('/api/cylinders', cylindersRoutes);
  app.use('/api/addresses', addressesRoutes);
  app.use('/api/analytics', analyticsRoutes);
  app.use('/api/contact', contactRoutes);

  // Admin API — namespaced under /api/admin to avoid colliding with the
  // consumer routes above (e.g. GET /api/orders vs admin's "all orders" list).
  app.use('/api/admin/auth', adminAuthRoutes);
  app.use('/api/admin/admin-users', adminAdminUsersRoutes);
  app.use('/api/admin/analytics', adminAnalyticsRoutes);
  app.use('/api/admin/customers', adminCustomersRoutes);
  app.use('/api/admin/listings', adminListingsRoutes);
  app.use('/api/admin/orders', adminOrdersRoutes);
  app.use('/api/admin/settings', adminSettingsRoutes);
  app.use('/api/admin/stats', adminStatsRoutes);
  app.use('/api/admin/users', adminUsersRoutes);
  app.use('/api/admin/vendors', adminVendorsRoutes);

  app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    Sentry.captureException(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
