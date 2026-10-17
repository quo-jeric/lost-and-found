import { Router } from 'express';
import pool from '../config/db.js';
import { findAllLocations } from '../repositories/location-repository.js';

const router = Router();

// GET /api/v1/locations - public lookup of locations
router.get('/', async (_req, res, next) => {
  try {
    const locations = await findAllLocations(pool);
    res.status(200).json({ data: locations });
  } catch (err) {
    next(err);
  }
});

export default router;
