import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { loginHandler, logoutHandler, meHandler } from '../controllers/auth-controller.js';

const router = Router();

// POST /api/v1/auth/login — public
router.post('/login', loginHandler);

// POST /api/v1/auth/logout — requires an active session
router.post('/logout', requireAuth, logoutHandler);

// GET /api/v1/auth/me — returns current user profile
router.get('/me', requireAuth, meHandler);

export default router;
