import 'dotenv/config';
import 'express-async-errors';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import authRouter from './routes/auth.js';
import vendorRouter from './routes/vendor.js';
import cylindersRouter from './routes/cylinders.js';
import ordersRouter from './routes/orders.js';

const app = express();
const PORT = process.env.PORT ?? 9000;

// ── Middleware ────────────────────────────────────────────────────────────────

app.use(cors());

// Capture raw body for Paystack webhook signature verification
app.use((req, _res, next) => {
  if (req.path === '/api/orders/webhook') {
    express.raw({ type: 'application/json' })(req, _res, (err) => {
      if (!err) (req as any).rawBody = req.body;
      next(err);
    });
  } else {
    express.json()(req, _res, next);
  }
});

// ── Routes ────────────────────────────────────────────────────────────────────

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/auth', authRouter);
app.use('/api/vendor', vendorRouter);
app.use('/api/cylinders', cylindersRouter);
app.use('/api/orders', ordersRouter);

// ── 404 handler ───────────────────────────────────────────────────────────────

app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Route not found' });
});

// ── Global error handler ──────────────────────────────────────────────────────

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`🚀  Server running on http://localhost:${PORT}`);
  console.log(`   Health → http://localhost:${PORT}/health`);
  console.log(`   Auth   → http://localhost:${PORT}/api/auth`);
});
