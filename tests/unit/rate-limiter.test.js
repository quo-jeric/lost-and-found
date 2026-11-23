import path from 'node:path';
import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createLoginLimiter } from '../../middleware/rate-limiter.js';

describe('rate-limiter middleware', () => {
  it('allows requests within limit and blocks subsequent requests with 429 JSON for API endpoints', async () => {
    const app = express();
    app.use(express.json());

    const testLimiter = createLoginLimiter({
      windowMs: 60 * 1000,
      limit: 2,
    });

    app.post('/api/v1/auth/login', testLimiter, (_req, res) => {
      res.json({ success: true });
    });

    const client = request(app);

    // 1st request -> 200
    const res1 = await client.post('/api/v1/auth/login').send({});
    expect(res1.status).toBe(200);

    // 2nd request -> 200
    const res2 = await client.post('/api/v1/auth/login').send({});
    expect(res2.status).toBe(200);

    // 3rd request -> 429
    const res3 = await client.post('/api/v1/auth/login').send({});
    expect(res3.status).toBe(429);
    expect(res3.body).toMatchObject({
      error: {
        code: 'TOO_MANY_REQUESTS',
      },
    });
  });

  it('renders login page with 429 status for HTML web form requests', async () => {
    const app = express();
    app.use(express.urlencoded({ extended: true }));

    app.set('view engine', 'ejs');
    app.set('views', path.join(process.cwd(), 'views'));

    const testLimiter = createLoginLimiter({
      windowMs: 60 * 1000,
      limit: 1,
    });

    app.post('/login', testLimiter, (_req, res) => {
      res.send('logged in');
    });

    const client = request(app);

    const res1 = await client
      .post('/login')
      .set('Accept', 'text/html')
      .send({ email: 'test@example.com' });
    expect(res1.status).toBe(200);

    const res2 = await client
      .post('/login')
      .set('Accept', 'text/html')
      .send({ email: 'test@example.com' });
    expect(res2.status).toBe(429);
    expect(res2.text).toContain('Too many login attempts');
  });
});
