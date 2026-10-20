import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import {
  cleanupFixture,
  createCatalogReferences,
  createStaffFixture,
  getTestApp,
  getTestPool,
} from '../helpers/test-database.js';

describe('items HTTP integration', () => {
  let pool;
  let app;
  let staff;
  let references;
  let itemId;

  beforeAll(async () => {
    pool = await getTestPool();
    app = await getTestApp();
    staff = await createStaffFixture(pool);
    references = await createCatalogReferences(pool);
  });

  afterAll(async () => {
    if (pool) {
      await cleanupFixture(pool, { userId: staff?.userId, itemId });
      await pool.end();
    }
  });

  it('protects item writes and persists public create, update, and archive operations', async () => {
    const title = `Item integration ${Date.now()}`;
    const payload = {
      title,
      description: 'Integration test item description.',
      category_id: references.categoryId,
      location_id: references.locationId,
      finder_name: 'Integration test',
      found_at: new Date(Date.now() - 60_000).toISOString(),
      color: 'Blue',
      brand: 'Test fixture',
    };

    await request(app).post('/api/v1/items').send(payload).expect(401);

    const session = request.agent(app);
    await session
      .post('/api/v1/auth/login')
      .send({ email: staff.email, password: staff.password })
      .expect(200);

    const createResponse = await session
      .post('/api/v1/items')
      .send(payload)
      .expect('Content-Type', /json/)
      .expect(201);
    itemId = createResponse.body.data.item_id;
    expect(createResponse.body.data).toMatchObject({
      title,
      item_status: 'active',
      logged_by: staff.userId,
    });

    const listResponse = await request(app)
      .get('/api/v1/items')
      .query({ search: title })
      .expect(200);
    expect(listResponse.body.data.map(({ item_id }) => item_id)).toContain(itemId);

    const updatedTitle = `${title} updated`;
    await session
      .put(`/api/v1/items/${itemId}`)
      .send({ title: updatedTitle, serial_number: 'TEST-ITEM-001' })
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toMatchObject({
          title: updatedTitle,
          serial_number: 'TEST-ITEM-001',
        });
      });

    const [persistedRows] = await pool.execute(
      'SELECT title, serial_number, item_status FROM items WHERE item_id = ?',
      [itemId],
    );
    expect(persistedRows[0]).toMatchObject({
      title: updatedTitle,
      serial_number: 'TEST-ITEM-001',
      item_status: 'active',
    });

    await session.delete(`/api/v1/items/${itemId}`).expect(204);
    await request(app).get(`/api/v1/items/${itemId}`).expect(404);

    const [archivedRows] = await pool.execute(
      'SELECT item_status FROM items WHERE item_id = ?',
      [itemId],
    );
    expect(archivedRows[0].item_status).toBe('inactive');

    const [auditRows] = await pool.execute(
      `SELECT action
       FROM audit_log
       WHERE table_name = 'items' AND record_id = ?
       ORDER BY id`,
      [itemId],
    );
    expect(auditRows.map(({ action }) => action)).toEqual([
      'INSERT',
      'UPDATE',
      'ARCHIVE',
    ]);
  });
});
