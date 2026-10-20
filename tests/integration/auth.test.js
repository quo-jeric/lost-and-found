import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import {
  cleanupFixture,
  createStaffFixture,
  getTestApp,
  getTestPool,
} from '../helpers/test-database.js';

describe('authentication HTTP integration', () => {
  let pool;
  let app;
  let staff;

  beforeAll(async () => {
    pool = await getTestPool();
    app = await getTestApp();
    staff = await createStaffFixture(pool);
  });

  afterAll(async () => {
    if (pool) {
      await cleanupFixture(pool, { userId: staff?.userId });
      await pool.end();
    }
  });

  it('logs in, reads the current profile, rejects anonymous access, and logs out', async () => {
    const anonymous = request(app);
    await anonymous.get('/api/v1/auth/me').expect(401);
    await anonymous.post('/api/v1/auth/logout').expect(401);

    const session = request.agent(app);
    const loginResponse = await session
      .post('/api/v1/auth/login')
      .send({ email: staff.email, password: staff.password })
      .expect('Content-Type', /json/)
      .expect(200);

    expect(loginResponse.body.data).toMatchObject({
      id: staff.userId,
      email: staff.email,
      role: 'admin',
    });
    expect(loginResponse.body.data).not.toHaveProperty('password_hash');

    await session
      .get('/api/v1/auth/me')
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toMatchObject({
          id: staff.userId,
          email: staff.email,
          role: 'admin',
        });
      });

    await session.post('/api/v1/auth/logout').expect(204);
    await session.get('/api/v1/auth/me').expect(401);

    const [auditRows] = await pool.execute(
      `SELECT action
       FROM audit_log
       WHERE table_name = 'users'
         AND record_id = ?
         AND action IN ('LOGIN', 'LOGOUT')
       ORDER BY id`,
      [staff.userId],
    );
    expect(auditRows.map(({ action }) => action)).toEqual(['LOGIN', 'LOGOUT']);
  });
});
