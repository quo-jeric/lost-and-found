import { AppError } from '../utils/app-error.js';

/**
 * Middleware: requireAuth
 *
 * Verifies that the incoming request has an active, authenticated session.
 * On success, populates req.actorId and req.actorRole for downstream
 * controllers and services.
 *
 * Rejects unauthenticated requests with 401 UNAUTHORIZED.
 *
 * @type {import('express').RequestHandler}
 */
export function requireAuth(req, _res, next) {
  const userId = req.session?.userId;

  if (!userId || typeof userId !== 'number' || userId <= 0) {
    return next(
      new AppError('Authentication required', { status: 401, code: 'UNAUTHORIZED' }),
    );
  }

  req.actorId = userId;
  req.actorRole = req.session.role ?? null;

  return next();
}

/**
 * Middleware factory: requireRole(...allowedRoles)
 *
 * Returns an Express middleware that:
 *   1. Rejects unauthenticated requests with 401 UNAUTHORIZED.
 *   2. Rejects authenticated requests whose role is not in allowedRoles
 *      with 403 FORBIDDEN.
 *   3. Defaults to deny — if no roles are passed, every request is rejected.
 *
 * Accepts roles as individual arguments or as a single array:
 *   requireRole('admin', 'guard')
 *   requireRole(['admin', 'guard'])
 *
 * @param {...(string|string[])} allowedRoles
 * @returns {import('express').RequestHandler}
 */
export function requireRole(...allowedRoles) {
  // Flatten so callers can pass an array or spread arguments.
  const roles = allowedRoles.flat();

  return function (req, _res, next) {
    const userId = req.session?.userId;

    if (!userId || typeof userId !== 'number' || userId <= 0) {
      return next(
        new AppError('Authentication required', { status: 401, code: 'UNAUTHORIZED' }),
      );
    }

    const userRole = req.session.role;

    if (roles.length === 0 || !userRole || !roles.includes(userRole)) {
      return next(
        new AppError('Forbidden: insufficient permissions', { status: 403, code: 'FORBIDDEN' }),
      );
    }

    req.actorId = userId;
    req.actorRole = userRole;

    return next();
  };
}

/**
 * Middleware: optionalAuth
 *
 * Soft-loads actor identity from the session if an authenticated session
 * exists. Always calls next() — never blocks the request.
 *
 * Sets req.actorId and req.actorRole to null when the caller is anonymous,
 * matching the contract expected by public services such as
 * claimsService.raiseClaim (actorId: null in the audit log entry).
 *
 * @type {import('express').RequestHandler}
 */
export function optionalAuth(req, _res, next) {
  const userId = req.session?.userId;

  if (userId && typeof userId === 'number' && userId > 0) {
    req.actorId = userId;
    req.actorRole = req.session.role ?? null;
  } else {
    req.actorId = null;
    req.actorRole = null;
  }

  return next();
}
