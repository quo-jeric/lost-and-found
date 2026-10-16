import { Router } from 'express';
import { optionalAuth, requireRole } from '../middleware/auth.js';
import {
  listItemsHandler,
  getItemHandler,
  createItemHandler,
  updateItemHandler,
  archiveItemHandler,
} from '../controllers/item-controller.js';

const router = Router();

router.get('/', optionalAuth, listItemsHandler);
router.get('/:id', optionalAuth, getItemHandler);
router.post('/', requireRole('admin', 'guard'), createItemHandler);
router.put('/:id', requireRole('admin', 'guard'), updateItemHandler);
router.delete('/:id', requireRole('admin'), archiveItemHandler);

export default router;
