import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../services/claims-service.js', () => ({
  raiseClaim: vi.fn(),
  listClaims: vi.fn(),
  getClaimById: vi.fn(),
  reviewClaim: vi.fn(),
}));

import {
  createClaimHandler,
  listClaimsHandler,
  getClaimHandler,
  reviewClaimHandler,
} from '../../controllers/claim-controller.js';
import * as claimsService from '../../services/claims-service.js';

function makeRes() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.end = vi.fn().mockReturnValue(res);
  return res;
}

describe('Claim Controller', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('createClaimHandler', () => {
    it('returns 201 with created claim, passing context without actorId', async () => {
      const createdClaim = { claim_id: 1, item_id: 42, claimant_name: 'John' };
      claimsService.raiseClaim.mockResolvedValue(createdClaim);

      const req = {
        body: { item_id: 42, claimant_name: 'John' },
        id: 'req-claim-1',
        ip: '10.0.0.1',
      };
      const res = makeRes();
      const next = vi.fn();

      await createClaimHandler(req, res, next);

      expect(claimsService.raiseClaim).toHaveBeenCalledWith(
        { item_id: 42, claimant_name: 'John' },
        { requestId: 'req-claim-1', ipAddress: '10.0.0.1' },
      );
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({ data: createdClaim });
      expect(next).not.toHaveBeenCalled();
    });

    it('forwards error to next() on validation failure', async () => {
      const err = new Error('Invalid claim');
      claimsService.raiseClaim.mockRejectedValue(err);

      const req = { body: {} };
      const res = makeRes();
      const next = vi.fn();

      await createClaimHandler(req, res, next);

      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('listClaimsHandler', () => {
    it('returns 200 with paginated claims for staff', async () => {
      const fakeResult = { claims: [{ claim_id: 1 }], total: 1, page: 1, pageSize: 20 };
      claimsService.listClaims.mockResolvedValue(fakeResult);

      const req = {
        query: { page: '1', pageSize: '20', claim_status: 'pending' },
        actorId: 2,
        id: 'req-list-claims',
        ip: '127.0.0.1',
      };
      const res = makeRes();
      const next = vi.fn();

      await listClaimsHandler(req, res, next);

      expect(claimsService.listClaims).toHaveBeenCalledWith(
        { item_id: undefined, claim_status: 'pending', search: undefined },
        { page: '1', pageSize: '20' },
        { actorId: 2, requestId: 'req-list-claims', ipAddress: '127.0.0.1' },
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        data: fakeResult.claims,
        meta: { page: 1, pageSize: 20, total: 1 },
      });
    });

    it('forwards error to next() when listClaims fails', async () => {
      const err = new Error('Database error');
      claimsService.listClaims.mockRejectedValue(err);

      const req = { query: {}, actorId: 2 };
      const res = makeRes();
      const next = vi.fn();

      await listClaimsHandler(req, res, next);

      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('getClaimHandler', () => {
    it('returns 200 with claim data when found', async () => {
      const fakeClaim = { claim_id: 5, claimant_name: 'Alice' };
      claimsService.getClaimById.mockResolvedValue(fakeClaim);

      const req = { params: { id: '5' } };
      const res = makeRes();
      const next = vi.fn();

      await getClaimHandler(req, res, next);

      expect(claimsService.getClaimById).toHaveBeenCalledWith('5');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ data: fakeClaim });
    });

    it('forwards 404 AppError when claim is not found', async () => {
      claimsService.getClaimById.mockResolvedValue(null);

      const req = { params: { id: '999' } };
      const res = makeRes();
      const next = vi.fn();

      await getClaimHandler(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ status: 404, code: 'NOT_FOUND' }),
      );
    });
  });

  describe('reviewClaimHandler', () => {
    it('returns 200 with updated claim on successful review', async () => {
      const updatedClaim = { claim_id: 5, claim_status: 'accepted' };
      claimsService.reviewClaim.mockResolvedValue(updatedClaim);

      const req = {
        params: { id: '5' },
        body: { status: 'accepted', processingNotes: 'Looks good' },
        actorId: 2,
        id: 'req-rev',
        ip: '127.0.0.1',
      };
      const res = makeRes();
      const next = vi.fn();

      await reviewClaimHandler(req, res, next);

      expect(claimsService.reviewClaim).toHaveBeenCalledWith(
        '5',
        { status: 'accepted', processingNotes: 'Looks good' },
        { actorId: 2, requestId: 'req-rev', ipAddress: '127.0.0.1' },
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ data: updatedClaim });
    });

    it('forwards error to next() when reviewClaim fails', async () => {
      const err = new Error('Review failed');
      claimsService.reviewClaim.mockRejectedValue(err);

      const req = { params: { id: '5' }, body: {}, actorId: 2 };
      const res = makeRes();
      const next = vi.fn();

      await reviewClaimHandler(req, res, next);

      expect(next).toHaveBeenCalledWith(err);
    });
  });
});
