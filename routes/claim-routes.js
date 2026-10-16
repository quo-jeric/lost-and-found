import { Router } from 'express';
import { optionalAuth, requireRole } from '../middleware/auth.js';
import {
  createClaimHandler,
  listClaimsHandler,
  getClaimHandler,
  reviewClaimHandler,
} from '../controllers/claim-controller.js';

const router = Router();

router.post('/', optionalAuth, createClaimHandler);
router.get('/', requireRole('admin', 'guard'), listClaimsHandler);
router.get('/:id', requireRole('admin', 'guard'), getClaimHandler);
router.patch('/:id/review', requireRole('admin', 'guard'), reviewClaimHandler);

export default router;
