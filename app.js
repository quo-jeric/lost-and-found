import express from 'express';
import { createSessionMiddleware } from './middleware/session.js';
import authRoutes from './routes/auth-routes.js';
import itemRoutes from './routes/item-routes.js';
import claimRoutes from './routes/claim-routes.js';

export const app = express();

// ── Security & body parsing ─────────────────────────────────────────────────

// Disable the X-Powered-By header so the server fingerprint is not leaked.
app.disable('x-powered-by');

app.use(express.json({ limit: '100kb' }));

// ── Session ─────────────────────────────────────────────────────────────────

// Must be registered before any route handler that reads req.session.
app.use(createSessionMiddleware());

// ── Routes ───────────────────────────────────────────────────────────────────

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/items', itemRoutes);
app.use('/api/v1/claims', claimRoutes);

// ── 404 catch-all ───────────────────────────────────────────────────────────

app.use((_req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
});

// ── Centralised error handler ────────────────────────────────────────────────

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  const status = err.status ?? 500;
  const code = err.code ?? 'INTERNAL_ERROR';

  // Only expose the real message for operational errors. Unexpected errors
  // get a generic message in production to avoid leaking internals.
  const message =
    err.isOperational || process.env.NODE_ENV !== 'production'
      ? err.message
      : 'An unexpected error occurred';

  res.status(status).json({ error: { code, message, details: err.details ?? [] } });
});
