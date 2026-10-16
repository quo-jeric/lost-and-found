// server.js
import 'dotenv/config';
import express from 'express';
import pool from './config/db.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// 1. Health-check endpoint for database testing
app.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT 1 + 1 AS solution');
    res.status(200).json({
      status: 'ok',
      dbConnection: 'successful',
      result: rows[0].solution,
    });
  } catch (err) {
    console.error('Database query failed:', err.message);
    res.status(500).json({
      status: 'error',
      dbConnection: 'failed',
      error: err.message,
    });
  }
});

// 2. Start server only after verifying database connectivity
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