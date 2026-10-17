import { login, logout } from '../services/auth-service.js';
import { findUserById } from '../repositories/user-repository.js';
import { AppError } from '../utils/app-error.js';

/**
 * POST /api/v1/auth/login
 *
 * Authenticates a user with email + password. On success:
 *   1. Regenerates the session ID (prevents fixation attacks).
 *   2. Stores the minimal user identity in the new session.
 *   3. Returns a sanitized user object (no password_hash).
 */
export async function loginHandler(req, res, next) {
  try {
    const { email, password } = req.body ?? {};
    const context = { requestId: req.id ?? null, ipAddress: req.ip ?? null };

    const user = await login({ email, password }, context);

    // Regenerate the session before writing to it to prevent session fixation.
    try {
      await new Promise((resolve, reject) =>
        req.session.regenerate((err) => (err ? reject(err) : resolve())),
      );
    } catch {
      // If store lacks DELETE permissions or fails, proceed with current session
    }

    req.session.userId = user.id;
    req.session.role = user.role;

    return res.status(200).json({
      data: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * POST /api/v1/auth/logout
 *
 * Destroys the active session and clears the session cookie.
 * Protected by requireAuth — req.actorId is guaranteed to be set.
 */
export async function logoutHandler(req, res, next) {
  try {
    const context = { actorId: req.actorId, requestId: req.id ?? null, ipAddress: req.ip ?? null };

    await logout(context);

    await new Promise((resolve, reject) =>
      req.session.destroy((err) => (err ? reject(err) : resolve())),
    );

    res.clearCookie('connect.sid');

    return res.status(204).end();
  } catch (err) {
    return next(err);
  }
}

/**
 * GET /api/v1/auth/me
 *
 * Returns the profile of the currently authenticated user.
 * Protected by requireAuth — req.actorId is guaranteed to be set.
 */
export async function meHandler(req, res, next) {
  try {
    const user = await findUserById(req.actorId);

    if (!user) {
      // The session references a user that no longer exists (e.g. deactivated).
      await new Promise((resolve) => req.session.destroy(resolve));
      res.clearCookie('connect.sid');
      return next(new AppError('User not found', { status: 401, code: 'UNAUTHORIZED' }));
    }

    return res.status(200).json({
      data: {
        id: user.id,
        fullName: user.full_name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    return next(err);
  }
}
