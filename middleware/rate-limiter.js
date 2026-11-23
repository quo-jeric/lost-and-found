import { rateLimit } from 'express-rate-limit';

/**
 * Creates a rate limiter middleware for authentication attempts.
 * Protects login endpoints against brute-force and credential-stuffing attacks.
 *
 * @param {object} [customOptions]
 * @returns {import('express').RequestHandler}
 */
export function createLoginLimiter(customOptions = {}) {
  const isTest = process.env.NODE_ENV === 'test';

  return rateLimit({
    windowMs: 15 * 60 * 1000, // 15-minute sliding window
    limit: isTest ? 1000 : 5, // 5 attempts per windowMs per IP (relaxed in tests)
    standardHeaders: 'draft-7', // draft-6/draft-7 RateLimit headers
    legacyHeaders: false, // Disable legacy X-RateLimit-* headers
    message: 'Too many login attempts from this IP. Please try again after 15 minutes.',
    handler: (req, res, _next, options) => {
      // For web form submissions (HTML navigation)
      if (req.accepts('html') && !req.originalUrl?.startsWith('/api/')) {
        return res.status(429).render('login', {
          title: 'Staff & Admin Login | CSPC Lost & Found',
          error: options.message || 'Too many login attempts. Please wait 15 minutes before trying again.',
          redirectUrl: req.body?.redirectUrl || null,
          showDemoAccounts: process.env.NODE_ENV !== 'production',
        });
      }

      // For REST API clients
      return res.status(429).json({
        error: {
          code: 'TOO_MANY_REQUESTS',
          message: options.message || 'Too many login attempts. Please try again after 15 minutes.',
        },
      });
    },
    ...customOptions,
  });
}

/**
 * Default pre-configured login rate limiter middleware.
 */
export const loginLimiter = createLoginLimiter();
