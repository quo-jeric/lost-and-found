// server.js
import 'dotenv/config';
import pool from './config/db.js';
import { app } from './app.js';
import config from './config/index.js';

const PORT = config.port || 3000;

// Start server only after verifying database connectivity
async function startServer() {
  try {
    // Test database connection on boot
    await pool.query('SELECT 1');
    console.log('Database connected successfully.');

    app.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('Failed to connect to the database on startup:', err.message);
    process.exit(1); // Exit process if DB connection fails
  }
}

startServer();