import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createSessionMiddleware } from './middleware/session.js';
import authRoutes from './routes/auth-routes.js';
import itemRoutes from './routes/item-routes.js';
import claimRoutes from './routes/claim-routes.js';
import categoryRoutes from './routes/category-routes.js';
import locationRoutes from './routes/location-routes.js';
import webRoutes from './routes/web-routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const app = express();

// ── Security & body parsing ─────────────────────────────────────────────────

// Disable the X-Powered-By header so the server fingerprint is not leaked.
app.disable('x-powered-by');

app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true }));

// ── View engine & static assets ─────────────────────────────────────────────

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

// ── View helpers ────────────────────────────────────────────────────────────

app.locals.getCategoryIconSvg = function (categoryName = '', title = '') {
  const combined = `${categoryName} ${title}`.toLowerCase();

  if (combined.includes('bottle') || combined.includes('flask') || combined.includes('tumbler')) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M10 2h4v3h-4zM9 5h6a1 1 0 0 1 1 1v2a3 3 0 0 1-1 2.2V20a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2v-9.8A3 3 0 0 1 8 8V6a1 1 0 0 1 1-1z"/></svg>`;
  }
  if (combined.includes('backpack') || combined.includes('bag') || combined.includes('purse')) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="4" y="8" width="16" height="14" rx="4"/><path d="M9 8V5a3 3 0 0 1 6 0v3"/><line x1="9" y1="13" x2="15" y2="13"/></svg>`;
  }
  if (combined.includes('headphone') || combined.includes('audio') || combined.includes('earphone')) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/></svg>`;
  }
  if (combined.includes('umbrella')) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M23 12a11.05 11.05 0 0 0-22 0zm-5 7a3 3 0 0 1-6 0v-7"/></svg>`;
  }
  if (combined.includes('calculator') || combined.includes('math')) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="16" y1="14" x2="16" y2="18"/><path d="M16 10h.01M12 10h.01M8 10h.01M12 14h.01M8 14h.01M12 18h.01M8 18h.01"/></svg>`;
  }
  if (combined.includes('key')) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/></svg>`;
  }
  if (combined.includes('id') || combined.includes('card') || combined.includes('document')) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><line x1="15" y1="8" x2="17" y2="8"/><line x1="15" y1="12" x2="17" y2="12"/><line x1="7" y1="16" x2="17" y2="16"/></svg>`;
  }
  if (combined.includes('notebook') || combined.includes('book') || combined.includes('spiral')) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/><path d="M6 6h10M6 10h10M6 14h6"/><path d="m18 13 4-4"/></svg>`;
  }
  if (combined.includes('glass') || combined.includes('eyewear') || combined.includes('prescription')) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="6" cy="15" r="4"/><circle cx="18" cy="15" r="4"/><path d="M14 15a2 2 0 0 0-4 0"/><path d="M2.5 13 5 7c.7-1.3 1.4-2 3-2h8c1.6 0 2.3.7 3 2l2.5 6"/></svg>`;
  }
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>`;
};

// ── Session ─────────────────────────────────────────────────────────────────

// Must be registered before any route handler that reads req.session.
app.use(createSessionMiddleware());

// ── API Routes ──────────────────────────────────────────────────────────────

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/items', itemRoutes);
app.use('/api/v1/claims', claimRoutes);
app.use('/api/v1/categories', categoryRoutes);
app.use('/api/v1/locations', locationRoutes);

// ── Web UI Routes ───────────────────────────────────────────────────────────

app.use('/', webRoutes);

// ── 404 catch-all ───────────────────────────────────────────────────────────

app.use((req, res) => {
  if (req.path.startsWith('/api/') || !req.accepts('html')) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
  }
  res.status(404).render('error', {
    title: 'Page Not Found',
    status: 404,
    message: 'The page you are looking for does not exist or has been moved.',
    currentUser: req.session?.userId ? { id: req.session.userId, role: req.session.role } : null,
  });
});

// ── Centralised error handler ────────────────────────────────────────────────

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  console.error('[Server Error]', err);
  const status = err.status ?? 500;
  const code = err.code ?? 'INTERNAL_ERROR';

  // Only expose the real message for operational errors. Unexpected errors
  // get a generic message in production to avoid leaking internals.
  const message =
    err.isOperational || process.env.NODE_ENV !== 'production'
      ? err.message
      : 'An unexpected error occurred';

  if (req.path.startsWith('/api/') || !req.accepts('html')) {
    return res.status(status).json({ error: { code, message, details: err.details ?? [] } });
  }

  res.status(status).render('error', {
    title: `Error ${status}`,
    status,
    message,
    currentUser: req.session?.userId ? { id: req.session.userId, role: req.session.role } : null,
  });
});

