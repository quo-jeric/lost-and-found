import { getTestApp, getTestPool } from '../helpers/test-database.js';

const pool = await getTestPool();
const app = await getTestApp();
const port = Number(process.env.TEST_PORT) || 4173;
const server = app.listen(port, '127.0.0.1');

server.on('listening', () => {
  console.log(`E2E server ready at http://127.0.0.1:${port}`);
});

server.on('error', async (error) => {
  console.error('E2E server failed to start:', error.message);
  await pool.end();
  process.exitCode = 1;
});

async function shutdown() {
  server.close(async () => {
    await pool.end();
  });
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
