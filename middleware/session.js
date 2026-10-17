import session from 'express-session';
import MySQLStoreFactory from 'express-mysql-session';
import { config } from '../config/index.js';
import { pool } from '../config/db.js';

const MySQLStore = MySQLStoreFactory(session);

/**
 * Creates and returns the configured express-session middleware backed by a
 * persistent MySQL session store.
 *
 * The store reuses the application's shared connection pool so no extra
 * connections are opened for session management. The `sessions` table is
 * created automatically on first run if it does not already exist.
 *
 * @returns {import('express-session').RequestHandler}
 */
export function createSessionMiddleware() {
  const store = new MySQLStore(
    {
      // Create the sessions table automatically if it does not exist.
      createDatabaseTable: true,
      schema: {
        tableName: 'sessions',
        columnNames: {
          session_id: 'session_id',
          expires: 'expires',
          data: 'data',
        },
      },
      // Disabled because the application database user holds no DELETE privileges
      clearExpired: false,
    },
    // Pass the shared pool directly instead of raw connection options so the
    // store reuses the application's existing connection pool.
    pool,
  );

  return session({
    secret: config.session.secret,
    store,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      // Only mark the cookie as Secure in production. In development the app
      // typically runs over HTTP, so this must stay false.
      secure: config.env === 'production',
      sameSite: 'lax',
      maxAge: config.session.maxAgeMs,
    },
  });
}
