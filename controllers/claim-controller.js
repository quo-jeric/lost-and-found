import * as claimsService from '../services/claims-service.js';
import { AppError } from '../utils/app-error.js';

/**
 * POST /api/v1/claims
 * Publicly file a claim. Context has no actorId.
 */
export async function createClaimHandler(req, res, next) {
  try {
    const context = {
      requestId: req.id ?? null,
      ipAddress: req.ip ?? null,
    };

    const claim = await claimsService.raiseClaim(req.body ?? {}, context);

    return res.status(201).json({ data: claim });
  } catch (err) {
    return next(err);
  }
}

/**
 * GET /api/v1/claims
 * List claims with filtering and pagination. Protected by requireRole('admin', 'guard').
 */
export async function listClaimsHandler(req, res, next) {
  try {
    const {
      page = 1,
      pageSize = 20,
      item_id,
      claim_status,
      search,
    } = req.query;

    const filters = { item_id, claim_status, search };
    const pagination = { page, pageSize };
    const context = {
      actorId: req.actorId,
      requestId: req.id ?? null,
      ipAddress: req.ip ?? null,
    };

    const result = await claimsService.listClaims(filters, pagination, context);

    return res.status(200).json({
      data: result.claims,
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
 * GET /api/v1/claims/:id
 * Get claim by ID. Protected by requireRole('admin', 'guard').
 */
export async function getClaimHandler(req, res, next) {
  try {
    const claim = await claimsService.getClaimById(req.params.id);

    if (!claim) {
      throw new AppError('Claim not found.', { status: 404, code: 'NOT_FOUND' });
    }

    return res.status(200).json({ data: claim });
  } catch (err) {
    return next(err);
  }
}

/**
 * PATCH /api/v1/claims/:id/review
 * Approve or reject a claim. Protected by requireRole('admin', 'guard').
 */
export async function reviewClaimHandler(req, res, next) {
  try {
    const context = {
      actorId: req.actorId,
      requestId: req.id ?? null,
      ipAddress: req.ip ?? null,
    };

    const updatedClaim = await claimsService.reviewClaim(req.params.id, req.body ?? {}, context);

    return res.status(200).json({ data: updatedClaim });
  } catch (err) {
    return next(err);
  }
}
