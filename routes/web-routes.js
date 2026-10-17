import { Router } from 'express';
import pool from '../config/db.js';
import { listItems } from '../services/items-service.js';
import { listClaims } from '../services/claims-service.js';
import { findAllCategories } from '../repositories/category-repository.js';
import { findAllLocations } from '../repositories/location-repository.js';
import { getLatestAuditLogs } from '../repositories/audit-repository.js';
import { login, logout } from '../services/auth-service.js';

const router = Router();

// Middleware to inject user session into res.locals
router.use((req, res, next) => {
  res.locals.currentUser = req.session?.userId
    ? { id: req.session.userId, role: req.session.role }
    : null;
  next();
});

// GET / - Public Lost & Found Catalog
router.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = 6;
    const [categories, locations, itemsResult] = await Promise.all([
      findAllCategories(pool).catch(() => []),
      findAllLocations(pool).catch(() => []),
      listItems({}, { page, pageSize }, { isPublic: true }).catch(() => ({
        items: [],
        total: 0,
        page,
        pageSize,
      })),
    ]);

    res.render('index', {
      title: 'Lost & Found Tracker | Campus Portal',
      categories,
      locations,
      items: itemsResult.items,
      meta: {
        page: itemsResult.page,
        pageSize: itemsResult.pageSize,
        total: itemsResult.total,
      },
    });
  } catch (err) {
    next(err);
  }
});

import { findUserById } from '../repositories/user-repository.js';

// GET /admin/found-items/new - Admin Console: Add Found Item View
router.get('/admin/found-items/new', async (req, res, next) => {
  if (!req.session?.userId) {
    return res.redirect('/login?redirect=/admin/found-items/new');
  }

  const isStaff = ['admin', 'guard'].includes(req.session.role);
  if (!isStaff) {
    return res.status(403).render('error', {
      title: 'Access Forbidden',
      status: 403,
      message: 'You do not have staff permissions to access the Admin Console.',
    });
  }

  try {
    const [categories, locations, user] = await Promise.all([
      findAllCategories(pool).catch(() => []),
      findAllLocations(pool).catch(() => []),
      findUserById(req.session.userId).catch(() => null),
    ]);

    const defaultName = req.session.role === 'guard' ? 'Ana Cruz' : 'Juan Reyes';
    const resolvedUser = user
      ? {
          ...user,
          fullName: user.fullName || user.full_name || defaultName,
          role: user.role || req.session.role,
        }
      : {
          fullName: defaultName,
          full_name: defaultName,
          role: req.session.role,
          email: req.session.role === 'guard' ? 'guard@cspc.edu.ph' : 'admin@cspc.edu.ph',
        };

    res.render('admin/add-item', {
      title: `${req.session.role === 'guard' ? 'Security Desk' : 'Admin Console'} | Add Found Item`,
      categories,
      locations,
      role: req.session.role,
      user: resolvedUser,
    });
  } catch (err) {
    next(err);
  }
});

// GET /login - Staff & Admin Unified Login page
router.get('/login', (req, res) => {
  if (req.session?.userId) {
    return req.session.role === 'admin'
      ? res.redirect('/admin/found-items/new')
      : res.redirect('/dashboard');
  }
  res.render('login', {
    title: 'Staff & Admin Login | CSPC Lost & Found',
    error: req.query.error || null,
    redirectUrl: req.query.redirect || null,
  });
});

// POST /login - Unified form submission handler for staff and admin
router.post('/login', async (req, res) => {
  try {
    const { email, password, redirectUrl } = req.body;
    const user = await login(
      { email, password },
      {
        requestId: req.headers['x-request-id'] || null,
        ipAddress: req.ip || null,
      },
    );

    req.session.userId = user.id;
    req.session.role = user.role;
    req.session.save((saveErr) => {
      if (saveErr) {
        return res.redirect('/login?error=Session+initialization+failed');
      }
      if (redirectUrl && redirectUrl.startsWith('/')) {
        return res.redirect(redirectUrl);
      }
      if (user.role === 'admin') {
        return res.redirect('/admin/found-items/new');
      } else {
        return res.redirect('/dashboard');
      }
    });
  } catch (err) {
    const message = encodeURIComponent(err.message || 'Invalid credentials');
    res.redirect(`/login?error=${message}`);
  }
});

// GET /logout - Quick staff logout
router.get('/logout', async (req, res) => {
  if (req.session?.userId) {
    await logout({
      actorId: req.session.userId,
      requestId: req.headers['x-request-id'] || null,
      ipAddress: req.ip || null,
    }).catch(() => {});

    req.session.destroy(() => {
      res.clearCookie('connect.sid');
      res.redirect('/');
    });
  } else {
    res.redirect('/');
  }
});

// GET /dashboard - Staff & Admin Command Center
router.get('/dashboard', async (req, res, next) => {
  if (!req.session?.userId) {
    return res.redirect('/login');
  }

  try {
    const actorId = req.session.userId;
    const isStaff = ['admin', 'guard'].includes(req.session.role);

    if (!isStaff) {
      return res.status(403).render('error', {
        title: 'Access Forbidden',
        status: 403,
        message: 'You do not have permission to access the staff dashboard.',
      });
    }

    // Admins without specific tab redirect to Add Item console
    if (req.session.role === 'admin' && !req.query.tab) {
      return res.redirect('/admin/found-items/new');
    }

    const [categories, locations, itemsResult, claimsResult, auditLogs, user] = await Promise.all([
      findAllCategories(pool).catch(() => []),
      findAllLocations(pool).catch(() => []),
      listItems({}, { page: 1, pageSize: 100 }, { isPublic: false }).catch(() => ({
        items: [],
        total: 0,
        page: 1,
        pageSize: 100,
      })),
      listClaims({}, { page: 1, pageSize: 100 }, { actorId }).catch(() => ({
        claims: [],
        total: 0,
        page: 1,
        pageSize: 100,
      })),
      getLatestAuditLogs(pool, { limit: 100 }).catch(() => []),
      findUserById(actorId).catch(() => null),
    ]);

    const defaultName = req.session.role === 'guard' ? 'Ana Cruz' : 'Juan Reyes';
    const resolvedUser = user
      ? {
          ...user,
          fullName: user.fullName || user.full_name || defaultName,
          role: user.role || req.session.role,
        }
      : {
          fullName: defaultName,
          full_name: defaultName,
          role: req.session.role,
          email: req.session.role === 'guard' ? 'guard@cspc.edu.ph' : 'admin@cspc.edu.ph',
        };

    res.render('dashboard', {
      title: `${req.session.role === 'guard' ? 'Security Officer Dashboard' : 'Staff Management Dashboard'} | Lost & Found`,
      categories,
      locations,
      items: itemsResult.items,
      claims: claimsResult.claims,
      auditLogs: auditLogs || [],
      role: req.session.role,
      user: resolvedUser,
      activeTab: req.query.tab || 'items',
    });
  } catch (err) {
    next(err);
  }
});

export default router;
