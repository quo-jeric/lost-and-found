/**
 * Operational application error. Throw this for expected failures such as
 * validation errors, not-found, forbidden, or conflict. Unexpected errors
 * should be allowed to bubble up as-is so the error middleware can log them
 * and return a generic 500.
 */
export class AppError extends Error {
  constructor(message, { status = 500, code = 'INTERNAL_ERROR', details } = {}) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.isOperational = true;
  }
}
