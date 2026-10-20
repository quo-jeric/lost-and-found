import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import {
  cleanupFixture,
  createCatalogReferences,
  createStaffFixture,
  getTestApp,
  getTestPool,
} from '../helpers/test-database.js';

describe('claims HTTP integration', () => {
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

  it('creates a public claim, prevents pending duplicates, and lets staff accept it', async () => {
    const title = `Claim integration ${Date.now()}`;
    const session = request.agent(app);
    const createItemResponse = await session
      .post('/api/v1/auth/login')
      .send({ email: staff.email, password: staff.password })
      .expect(200);
    expect(createItemResponse.body.data.id).toBe(staff.userId);

    const itemResponse = await session
      .post('/api/v1/items')
      .send({
        title,
        category_id: references.categoryId,
        location_id: references.locationId,
        finder_name: 'Integration test',
        found_at: new Date(Date.now() - 60_000).toISOString(),
      })
      .expect(201);
    itemId = itemResponse.body.data.item_id;

    const claimantEmail = `claim-${Date.now()}@example.test`;
    const publicRequest = {
      item_id: itemId,
      claimant_name: 'Integration Claimant',
      claimant_email: claimantEmail,
      proof_description: 'A unique identifying mark for the integration test.',
    };

    await request(app).get('/api/v1/claims').expect(401);

    const claimResponse = await request(app)
      .post('/api/v1/claims')
      .send(publicRequest)
      .expect('Content-Type', /json/)
      .expect(201);
    const claimId = claimResponse.body.data.claim_id;
    expect(claimResponse.body.data).toMatchObject({
      item_id: itemId,
      claimant_email: claimantEmail,
      claim_status: 'pending',
    });

    await request(app)
      .post('/api/v1/claims')
      .send(publicRequest)
      .expect(409)
      .expect(({ body }) => {
        expect(body.error.code).toBe('DUPLICATE_CLAIM');
      });

    const listResponse = await session
      .get('/api/v1/claims')
      .query({ item_id: itemId })
      .expect(200);
    expect(listResponse.body.data.map(({ claim_id }) => claim_id)).toContain(claimId);

    const reviewResponse = await session
      .patch(`/api/v1/claims/${claimId}/review`)
      .send({ status: 'accepted', processingNotes: 'Verified by integration test.' })
      .expect(200);
    expect(reviewResponse.body.data).toMatchObject({
      claim_id: claimId,
      claim_status: 'accepted',
      processed_by: staff.userId,
      processing_notes: 'Verified by integration test.',
    });

    const [claimRows] = await pool.execute(
      `SELECT claim_status, processed_by
       FROM claims
       WHERE claim_id = ?`,
      [claimId],
    );
    expect(claimRows[0]).toMatchObject({
      claim_status: 'accepted',
      processed_by: staff.userId,
    });

    const [itemRows] = await pool.execute(
      'SELECT item_status FROM items WHERE item_id = ?',
      [itemId],
    );
    expect(itemRows[0].item_status).toBe('inactive');

    const [auditRows] = await pool.execute(
      `SELECT table_name, action, actor_user_id
       FROM audit_log
       WHERE (table_name = 'claims' AND record_id = ?)
          OR (table_name = 'items' AND record_id = ?)
       ORDER BY id`,
      [claimId, itemId],
    );
    expect(auditRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table_name: 'claims',
          action: 'INSERT',
          actor_user_id: null,
        }),
        expect.objectContaining({
          table_name: 'claims',
          action: 'UPDATE',
          actor_user_id: staff.userId,
        }),
        expect.objectContaining({
          table_name: 'items',
          action: 'UPDATE',
          actor_user_id: staff.userId,
        }),
      ]),
    );
  });
});
