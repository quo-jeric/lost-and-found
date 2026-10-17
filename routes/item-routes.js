import { Router } from 'express';
import { optionalAuth, requireRole } from '../middleware/auth.js';
import { uploadItemImage } from '../middleware/upload.js';
import {
  listItemsHandler,
  getItemHandler,
  createItemHandler,
  updateItemHandler,
  archiveItemHandler,
  uploadImageHandler,
} from '../controllers/item-controller.js';

const router = Router();

router.get('/', optionalAuth, listItemsHandler);
router.get('/:id', optionalAuth, getItemHandler);
router.post('/upload', requireRole('admin', 'guard'), uploadItemImage.single('image'), uploadImageHandler);
router.post('/', requireRole('admin', 'guard'), uploadItemImage.single('image'), createItemHandler);
router.put('/:id', requireRole('admin', 'guard'), uploadItemImage.single('image'), updateItemHandler);
router.delete('/:id', requireRole('admin'), archiveItemHandler);

export default router;
