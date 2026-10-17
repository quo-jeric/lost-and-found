import * as itemsService from '../services/items-service.js';
import { AppError } from '../utils/app-error.js';

/**
 * GET /api/v1/items
 * Paginated list/search. Publicly accessible.
 */
export async function listItemsHandler(req, res, next) {
  try {
    const {
      page = 1,
      pageSize = 20,
      category_id,
      location_id,
      search,
      item_status,
      from_date,
      to_date,
    } = req.query;

    const filters = {
      category_id,
      location_id,
      search,
      item_status,
      from_date,
      to_date,
    };
    const pagination = { page, pageSize };
    const isPublic = req.actorId === null || req.actorId === undefined;

    const result = await itemsService.listItems(filters, pagination, { isPublic });

    return res.status(200).json({
      data: result.items,
      meta: {
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
      },
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * GET /api/v1/items/:id
 * Single item detail. Publicly accessible.
 */
export async function getItemHandler(req, res, next) {
  try {
    const isPublic = req.actorId === null || req.actorId === undefined;
    const item = await itemsService.getItemById(req.params.id, { isPublic });

    if (!item) {
      throw new AppError('Item not found.', { status: 404, code: 'NOT_FOUND' });
    }

    return res.status(200).json({ data: item });
  } catch (err) {
    return next(err);
  }
}

/**
 * POST /api/v1/items/upload
 * Upload an item photo. Protected by requireRole('admin', 'guard').
 */
export async function uploadImageHandler(req, res, next) {
  try {
    if (!req.file) {
      throw new AppError('No image file uploaded.', { status: 400, code: 'FILE_REQUIRED' });
    }

    const imageUrl = `/uploads/items/${req.file.filename}`;
    return res.status(200).json({ data: { imageUrl, filename: req.file.filename } });
  } catch (err) {
    return next(err);
  }
}

/**
 * POST /api/v1/items
 * Create a new lost/found item. Protected by requireRole('admin', 'guard').
 */
export async function createItemHandler(req, res, next) {
  try {
    const context = {
      actorId: req.actorId,
      requestId: req.id ?? null,
      ipAddress: req.ip ?? null,
    };

    const payload = { ...(req.body ?? {}) };
    if (req.file) {
      payload.image_url = `/uploads/items/${req.file.filename}`;
    }

    const item = await itemsService.addItem(payload, context);

    return res.status(201).json({ data: item });
  } catch (err) {
    return next(err);
  }
}

/**
 * PUT /api/v1/items/:id
 * Update an existing item. Protected by requireRole('admin', 'guard').
 */
export async function updateItemHandler(req, res, next) {
  try {
    const context = {
      actorId: req.actorId,
      requestId: req.id ?? null,
      ipAddress: req.ip ?? null,
    };

    const payload = { ...(req.body ?? {}) };

    // Normalize custody status values (stored, processing, claimed) to database ENUM ('active', 'inactive')
    if (payload.item_status) {
      const s = String(payload.item_status).toLowerCase().trim();
      if (s === 'stored' || s === 'processing') {
        const tag = s.charAt(0).toUpperCase() + s.slice(1);
        if (!payload.storage_notes || !payload.storage_notes.toLowerCase().includes(s)) {
          payload.storage_notes = payload.storage_notes 
            ? `Status: ${tag} - ${payload.storage_notes}` 
            : `Status: ${tag}`;
        }
        payload.item_status = 'active';
      } else if (s === 'claimed') {
        payload.item_status = 'inactive';
      }
    }

    const item = await itemsService.editItem(req.params.id, payload, context);

    return res.status(200).json({ data: item });
  } catch (err) {
    return next(err);
  }
}

/**
 * DELETE /api/v1/items/:id
 * Soft-archive an item. Protected by requireRole('admin').
 */
export async function archiveItemHandler(req, res, next) {
  try {
    const context = {
      actorId: req.actorId,
      requestId: req.id ?? null,
      ipAddress: req.ip ?? null,
    };

    await itemsService.archiveItem(req.params.id, context);

    return res.status(204).end();
  } catch (err) {
    return next(err);
  }
}
