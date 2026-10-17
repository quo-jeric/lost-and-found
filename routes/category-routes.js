import { Router } from 'express';
import pool from '../config/db.js';
import { findAllCategories } from '../repositories/category-repository.js';

const router = Router();

// GET /api/v1/categories - public lookup of categories
router.get('/', async (_req, res, next) => {
  try {
    const categories = await findAllCategories(pool);
    res.status(200).json({ data: categories });
  } catch (err) {
    next(err);
  }
});

export default router;
