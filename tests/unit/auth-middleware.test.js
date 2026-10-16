import { describe, it, expect, vi, beforeEach } from 'vitest';
import { requireAuth, requireRole, optionalAuth } from '../../middleware/auth.js';
import { AppError } from '../../utils/app-error.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Builds a minimal mock Express request object.
 * Pass `session` to override session properties.
 */
function makeReq(session = {}) {
  return { session };
}

/** Captures arguments passed to next() */
function makeNext() {
  return vi.fn();
}

const RES = {}; // res is unused by all three middlewares

// ── requireAuth ───────────────────────────────────────────────────────────────

describe('requireAuth', () => {
  it('calls next() and sets req.actorId / req.actorRole when session is valid', () => {
    const req = makeReq({ userId: 7, role: 'guard' });
    const next = makeNext();

    requireAuth(req, RES, next);

    expect(next).toHaveBeenCalledOnce();
    expect(next).toHaveBeenCalledWith(); // called with no arguments → no error
    expect(req.actorId).toBe(7);
    expect(req.actorRole).toBe('guard');
  });

  it('sets actorRole to null when session has no role', () => {
    const req = makeReq({ userId: 3 });
    const next = makeNext();

    requireAuth(req, RES, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.actorId).toBe(3);
    expect(req.actorRole).toBeNull();
  });

  it('passes AppError(401) when session is undefined', () => {
    const req = { session: undefined };
    const next = makeNext();

    requireAuth(req, RES, next);

    expect(next).toHaveBeenCalledOnce();
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(AppError);
    expect(err.status).toBe(401);
    expect(err.code).toBe('UNAUTHORIZED');
  });

  it('passes AppError(401) when session.userId is null', () => {
    const req = makeReq({ userId: null });
    const next = makeNext();

    requireAuth(req, RES, next);

    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(AppError);
    expect(err.status).toBe(401);
  });

  it('passes AppError(401) when session.userId is 0', () => {
    const req = makeReq({ userId: 0 });
    const next = makeNext();

    requireAuth(req, RES, next);

    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(AppError);
    expect(err.status).toBe(401);
  });

  it('passes AppError(401) when session.userId is a string', () => {
    const req = makeReq({ userId: '5' });
    const next = makeNext();

    requireAuth(req, RES, next);

    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(AppError);
    expect(err.status).toBe(401);
  });
});

// ── requireRole ───────────────────────────────────────────────────────────────

describe('requireRole', () => {
  it('calls next() when session role matches a single allowed role', () => {
    const req = makeReq({ userId: 1, role: 'admin' });
    const next = makeNext();

    requireRole('admin')(req, RES, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.actorId).toBe(1);
    expect(req.actorRole).toBe('admin');
  });

  it('calls next() when session role is one of multiple allowed roles', () => {
    const req = makeReq({ userId: 2, role: 'guard' });
    const next = makeNext();

    requireRole('admin', 'guard')(req, RES, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.actorId).toBe(2);
    expect(req.actorRole).toBe('guard');
  });

  it('calls next() when roles are passed as an array', () => {
    const req = makeReq({ userId: 3, role: 'admin' });
    const next = makeNext();

    requireRole(['admin', 'guard'])(req, RES, next);

    expect(next).toHaveBeenCalledWith();
  });

  it('passes AppError(401) when session is missing (unauthenticated)', () => {
    const req = { session: undefined };
    const next = makeNext();

    requireRole('admin')(req, RES, next);

    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(AppError);
    expect(err.status).toBe(401);
    expect(err.code).toBe('UNAUTHORIZED');
  });

  it('passes AppError(401) when session.userId is absent', () => {
    const req = makeReq({ role: 'admin' }); // userId missing
    const next = makeNext();

    requireRole('admin')(req, RES, next);

    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(AppError);
    expect(err.status).toBe(401);
  });

  it('passes AppError(403) when authenticated role is not in the allowed list', () => {
    const req = makeReq({ userId: 4, role: 'user' });
    const next = makeNext();

    requireRole('admin', 'guard')(req, RES, next);

    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(AppError);
    expect(err.status).toBe(403);
    expect(err.code).toBe('FORBIDDEN');
  });

  it('passes AppError(403) when session has no role property', () => {
    const req = makeReq({ userId: 5 }); // role missing
    const next = makeNext();

    requireRole('admin')(req, RES, next);

    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(AppError);
    expect(err.status).toBe(403);
  });

  it('passes AppError(403) when no allowed roles are specified (default deny)', () => {
    const req = makeReq({ userId: 6, role: 'admin' });
    const next = makeNext();

    requireRole()(req, RES, next); // empty list

    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(AppError);
    expect(err.status).toBe(403);
  });
});

// ── optionalAuth ─────────────────────────────────────────────────────────────

describe('optionalAuth', () => {
  it('populates actorId and actorRole and calls next() when authenticated', () => {
    const req = makeReq({ userId: 10, role: 'guard' });
    const next = makeNext();

    optionalAuth(req, RES, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.actorId).toBe(10);
    expect(req.actorRole).toBe('guard');
  });

  it('sets actorId and actorRole to null and calls next() when session is missing', () => {
    const req = { session: undefined };
    const next = makeNext();

    optionalAuth(req, RES, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.actorId).toBeNull();
    expect(req.actorRole).toBeNull();
  });

  it('sets actorId to null when session.userId is 0', () => {
    const req = makeReq({ userId: 0 });
    const next = makeNext();

    optionalAuth(req, RES, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.actorId).toBeNull();
  });

  it('sets actorId to null when session.userId is a string', () => {
    const req = makeReq({ userId: '9' });
    const next = makeNext();

    optionalAuth(req, RES, next);

    expect(req.actorId).toBeNull();
  });

  it('sets actorRole to null when authenticated but no role is set', () => {
    const req = makeReq({ userId: 11 });
    const next = makeNext();

    optionalAuth(req, RES, next);

    expect(req.actorId).toBe(11);
    expect(req.actorRole).toBeNull();
  });
});
