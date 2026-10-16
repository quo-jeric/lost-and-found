import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock all external dependencies before importing the service ───────────────
// No real DB connection, no network, no FS access in unit tests.

vi.mock('../../config/db.js', () => ({
  pool: { getConnection: vi.fn() },
  default: { getConnection: vi.fn() },
}));

vi.mock('../../repositories/item-repository.js', () => ({
  findItemById: vi.fn(),
  archiveItem: vi.fn(),
}));

vi.mock('../../repositories/claim-repository.js', () => ({
  insertClaim: vi.fn(),
  findClaimById: vi.fn(),
  findPendingClaimByContact: vi.fn(),
  findClaims: vi.fn(),
  updateClaimStatus: vi.fn(),
}));

vi.mock('../../repositories/audit-repository.js', () => ({
  writeAudit: vi.fn(),
}));

// Imports after mocks are wired up
import { raiseClaim, getClaimById, listClaims, reviewClaim } from '../../services/claims-service.js';
import { pool } from '../../config/db.js';
import { findItemById, archiveItem } from '../../repositories/item-repository.js';
import {
  insertClaim,
  findClaimById,
  findPendingClaimByContact,
  findClaims,
  updateClaimStatus,
} from '../../repositories/claim-repository.js';
import { writeAudit } from '../../repositories/audit-repository.js';
import { AppError } from '../../utils/app-error.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const CLAIM_ID = 7;

const VALID_PAYLOAD = {
  item_id: 42,
  claimant_name: 'Maria Santos',
  claimant_email: 'maria@example.com',
  claimant_phone: '+639171234567',
  proof_description: 'Blue Hydro Flask with sticker of a mountain on the side.',
};

const ACTIVE_ITEM = {
  item_id: 42,
  title: 'Blue Hydro Flask',
  item_status: 'active',
};

const INACTIVE_ITEM = {
  item_id: 42,
  title: 'Blue Hydro Flask',
  item_status: 'inactive',
};

const DB_CLAIM = {
  claim_id: CLAIM_ID,
  item_id: 42,
  claimant_name: 'Maria Santos',
  claimant_email: 'maria@example.com',
  claimant_phone: '+639171234567',
  proof_description: 'Blue Hydro Flask with sticker of a mountain on the side.',
  claim_status: 'pending',
  processed_by: null,
  processing_notes: null,
  resolved_at: null,
  created_at: new Date('2026-10-16T10:00:00Z'),
  updated_at: new Date('2026-10-16T10:00:00Z'),
};

/** Build a mock transaction connection with all lifecycle methods as spies. */
function makeMockConn() {
  return {
    beginTransaction: vi.fn().mockResolvedValue(undefined),
    commit: vi.fn().mockResolvedValue(undefined),
    rollback: vi.fn().mockResolvedValue(undefined),
    release: vi.fn(),
    execute: vi.fn(),
    query: vi.fn(),
  };
}

// ── Test Suites ───────────────────────────────────────────────────────────────

describe('raiseClaim()', () => {
  let mockConn;

  beforeEach(() => {
    vi.clearAllMocks();
    mockConn = makeMockConn();
    pool.getConnection.mockResolvedValue(mockConn);

    // Default happy-path stubs
    findItemById.mockResolvedValue(ACTIVE_ITEM);
    findPendingClaimByContact.mockResolvedValue(null);
    insertClaim.mockResolvedValue(CLAIM_ID);
    findClaimById.mockResolvedValue(DB_CLAIM);
    writeAudit.mockResolvedValue(1);
  });

  // ── Success paths ────────────────────────────────────────────────────────────

  describe('success path', () => {
    it('creates a claim with name + email + phone and returns the created record', async () => {
      const result = await raiseClaim(VALID_PAYLOAD);
      expect(result).toEqual(DB_CLAIM);
    });

    it('creates a claim with only email (phone omitted)', async () => {
      const { claimant_phone: _p, ...emailOnly } = VALID_PAYLOAD;
      const result = await raiseClaim({ ...emailOnly, claimant_phone: null });
      expect(result).toEqual(DB_CLAIM);
      expect(insertClaim).toHaveBeenCalledWith(
        mockConn,
        expect.objectContaining({ claimant_email: 'maria@example.com', claimant_phone: null }),
      );
    });

    it('creates a claim with only phone (email omitted)', async () => {
      const result = await raiseClaim({
        ...VALID_PAYLOAD,
        claimant_email: null,
        claimant_phone: '+639171234567',
      });
      expect(result).toEqual(DB_CLAIM);
      expect(insertClaim).toHaveBeenCalledWith(
        mockConn,
        expect.objectContaining({ claimant_email: null, claimant_phone: '+639171234567' }),
      );
    });

    it('defaults claim_status to pending (via insertClaim hard-coding in repository)', async () => {
      await raiseClaim(VALID_PAYLOAD);
      // The service does not pass claim_status; it is fixed in the SQL INSERT.
      const callArgs = insertClaim.mock.calls[0][1];
      expect(callArgs).not.toHaveProperty('claim_status');
    });

    it('passes actorId: null to writeAudit for public claimant', async () => {
      await raiseClaim(VALID_PAYLOAD);
      expect(writeAudit).toHaveBeenCalledWith(
        mockConn,
        expect.objectContaining({ actorId: null, action: 'INSERT', tableName: 'claims' }),
      );
    });

    it('forwards requestId and ipAddress to writeAudit', async () => {
      await raiseClaim(VALID_PAYLOAD, { requestId: 'req-abc', ipAddress: '192.168.0.1' });
      expect(writeAudit).toHaveBeenCalledWith(
        mockConn,
        expect.objectContaining({ requestId: 'req-abc', ipAddress: '192.168.0.1' }),
      );
    });

    it('commits the transaction on success', async () => {
      await raiseClaim(VALID_PAYLOAD);
      expect(mockConn.commit).toHaveBeenCalledOnce();
      expect(mockConn.rollback).not.toHaveBeenCalled();
    });

    it('always releases the connection after success', async () => {
      await raiseClaim(VALID_PAYLOAD);
      expect(mockConn.release).toHaveBeenCalledOnce();
    });

    it('writes the audit log with the created record as newValues', async () => {
      await raiseClaim(VALID_PAYLOAD);
      expect(writeAudit).toHaveBeenCalledWith(
        mockConn,
        expect.objectContaining({ newValues: DB_CLAIM, recordId: CLAIM_ID }),
      );
    });

    it('trims whitespace from claimant_name', async () => {
      await raiseClaim({ ...VALID_PAYLOAD, claimant_name: '  Maria Santos  ' });
      expect(insertClaim).toHaveBeenCalledWith(
        mockConn,
        expect.objectContaining({ claimant_name: 'Maria Santos' }),
      );
    });

    it('stores null proof_description when not provided', async () => {
      const { proof_description: _p, ...withoutProof } = VALID_PAYLOAD;
      await raiseClaim(withoutProof);
      expect(insertClaim).toHaveBeenCalledWith(
        mockConn,
        expect.objectContaining({ proof_description: null }),
      );
    });
  });

  // ── Validation failures ───────────────────────────────────────────────────────

  describe('payload validation failures', () => {
    async function expectValidationError(data, expectedField) {
      await expect(raiseClaim(data)).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
        status: 400,
        details: expect.arrayContaining([expect.objectContaining({ field: expectedField })]),
      });
      // Validation must fail before acquiring any connection
      expect(pool.getConnection).not.toHaveBeenCalled();
    }

    it('rejects when item_id is missing', async () => {
      const { item_id: _i, ...data } = VALID_PAYLOAD;
      await expectValidationError(data, 'item_id');
    });

    it('rejects when item_id is zero', async () => {
      await expectValidationError({ ...VALID_PAYLOAD, item_id: 0 }, 'item_id');
    });

    it('rejects when item_id is negative', async () => {
      await expectValidationError({ ...VALID_PAYLOAD, item_id: -5 }, 'item_id');
    });

    it('rejects when item_id is a non-numeric string', async () => {
      await expectValidationError({ ...VALID_PAYLOAD, item_id: 'abc' }, 'item_id');
    });

    it('rejects when claimant_name is missing', async () => {
      const { claimant_name: _n, ...data } = VALID_PAYLOAD;
      await expectValidationError(data, 'claimant_name');
    });

    it('rejects when claimant_name is empty string', async () => {
      await expectValidationError({ ...VALID_PAYLOAD, claimant_name: '' }, 'claimant_name');
    });

    it('rejects when claimant_name is whitespace-only', async () => {
      await expectValidationError({ ...VALID_PAYLOAD, claimant_name: '   ' }, 'claimant_name');
    });

    it('rejects when claimant_name exceeds 50 characters', async () => {
      await expectValidationError(
        { ...VALID_PAYLOAD, claimant_name: 'A'.repeat(51) },
        'claimant_name',
      );
    });

    it('rejects when both email and phone are absent', async () => {
      await expectValidationError(
        { ...VALID_PAYLOAD, claimant_email: null, claimant_phone: null },
        'contact',
      );
    });

    it('rejects when both email and phone are empty strings', async () => {
      await expectValidationError(
        { ...VALID_PAYLOAD, claimant_email: '', claimant_phone: '' },
        'contact',
      );
    });

    it('rejects when claimant_email has invalid format', async () => {
      await expectValidationError(
        { ...VALID_PAYLOAD, claimant_phone: null, claimant_email: 'not-an-email' },
        'claimant_email',
      );
    });

    it('rejects when claimant_email exceeds 50 characters', async () => {
      await expectValidationError(
        { ...VALID_PAYLOAD, claimant_phone: null, claimant_email: 'a'.repeat(45) + '@b.com' },
        'claimant_email',
      );
    });

    it('rejects when claimant_phone exceeds 20 characters', async () => {
      await expectValidationError(
        { ...VALID_PAYLOAD, claimant_email: null, claimant_phone: '1'.repeat(21) },
        'claimant_phone',
      );
    });

    it('rejects when proof_description exceeds 5000 characters', async () => {
      await expectValidationError(
        { ...VALID_PAYLOAD, proof_description: 'x'.repeat(5001) },
        'proof_description',
      );
    });

    it('does NOT reject when email has exactly 50 characters', async () => {
      // Build a valid 50-char email: local@domain.tld
      // 50 = len("a".repeat(43) + "@b.com") → 43+6 = 49, so use 44 + "@b.com" = 50
      const edge = 'a'.repeat(44) + '@b.com';
      expect(edge.length).toBe(50);
      await expect(raiseClaim({ ...VALID_PAYLOAD, claimant_email: edge })).resolves.toEqual(DB_CLAIM);
    });

    it('does NOT reject when claimant_name has exactly 50 characters', async () => {
      const edge = 'A'.repeat(50);
      await expect(raiseClaim({ ...VALID_PAYLOAD, claimant_name: edge })).resolves.toEqual(DB_CLAIM);
    });
  });

  // ── Item existence & status checks ───────────────────────────────────────────

  describe('item verification', () => {
    it('throws NOT_FOUND (404) if the item does not exist', async () => {
      findItemById.mockResolvedValue(null);
      await expect(raiseClaim(VALID_PAYLOAD)).rejects.toMatchObject({
        status: 404,
        code: 'NOT_FOUND',
      });
    });

    it('throws ITEM_INACTIVE (400) if the item has status inactive', async () => {
      findItemById.mockResolvedValue(INACTIVE_ITEM);
      await expect(raiseClaim(VALID_PAYLOAD)).rejects.toMatchObject({
        status: 400,
        code: 'ITEM_INACTIVE',
      });
    });

    it('does not insert a claim when item is not found', async () => {
      findItemById.mockResolvedValue(null);
      await expect(raiseClaim(VALID_PAYLOAD)).rejects.toBeDefined();
      expect(insertClaim).not.toHaveBeenCalled();
    });

    it('does not insert a claim when item is inactive', async () => {
      findItemById.mockResolvedValue(INACTIVE_ITEM);
      await expect(raiseClaim(VALID_PAYLOAD)).rejects.toBeDefined();
      expect(insertClaim).not.toHaveBeenCalled();
    });
  });

  // ── Duplicate pending claim prevention ───────────────────────────────────────

  describe('duplicate claim prevention', () => {
    const EXISTING_PENDING_CLAIM = {
      claim_id: 3,
      item_id: 42,
      claimant_email: 'maria@example.com',
      claimant_phone: '+639171234567',
      claim_status: 'pending',
    };

    it('throws DUPLICATE_CLAIM (409) when a pending claim with the same email exists', async () => {
      findPendingClaimByContact.mockResolvedValue(EXISTING_PENDING_CLAIM);
      await expect(raiseClaim(VALID_PAYLOAD)).rejects.toMatchObject({
        status: 409,
        code: 'DUPLICATE_CLAIM',
      });
    });

    it('throws DUPLICATE_CLAIM (409) when a pending claim with the same phone exists', async () => {
      findPendingClaimByContact.mockResolvedValue({
        ...EXISTING_PENDING_CLAIM,
        claimant_email: null,
      });
      await expect(raiseClaim(VALID_PAYLOAD)).rejects.toMatchObject({
        status: 409,
        code: 'DUPLICATE_CLAIM',
      });
    });

    it('allows a new claim when prior claim with same contact was rejected', async () => {
      // findPendingClaimByContact returns null for rejected claims (status filter in SQL)
      findPendingClaimByContact.mockResolvedValue(null);
      const result = await raiseClaim(VALID_PAYLOAD);
      expect(result).toEqual(DB_CLAIM);
    });

    it('allows a new claim when prior claim with same contact was accepted', async () => {
      findPendingClaimByContact.mockResolvedValue(null);
      const result = await raiseClaim(VALID_PAYLOAD);
      expect(result).toEqual(DB_CLAIM);
    });

    it('does not insert when duplicate is detected', async () => {
      findPendingClaimByContact.mockResolvedValue(EXISTING_PENDING_CLAIM);
      await expect(raiseClaim(VALID_PAYLOAD)).rejects.toBeDefined();
      expect(insertClaim).not.toHaveBeenCalled();
    });
  });

  // ── Transaction integrity & rollback ─────────────────────────────────────────

  describe('transaction integrity and rollback', () => {
    it('rolls back and releases if insertClaim throws', async () => {
      insertClaim.mockRejectedValue(new Error('DB insert error'));
      await expect(raiseClaim(VALID_PAYLOAD)).rejects.toThrow('DB insert error');
      expect(mockConn.rollback).toHaveBeenCalledOnce();
      expect(mockConn.release).toHaveBeenCalledOnce();
      expect(mockConn.commit).not.toHaveBeenCalled();
    });

    it('rolls back and releases if writeAudit throws', async () => {
      writeAudit.mockRejectedValue(new Error('Audit write failed'));
      await expect(raiseClaim(VALID_PAYLOAD)).rejects.toThrow('Audit write failed');
      expect(mockConn.rollback).toHaveBeenCalledOnce();
      expect(mockConn.release).toHaveBeenCalledOnce();
      expect(mockConn.commit).not.toHaveBeenCalled();
    });

    it('releases connection even when rollback itself throws', async () => {
      insertClaim.mockRejectedValue(new Error('DB insert error'));
      mockConn.rollback.mockRejectedValue(new Error('Rollback failed'));
      await expect(raiseClaim(VALID_PAYLOAD)).rejects.toBeDefined();
      expect(mockConn.release).toHaveBeenCalledOnce();
    });

    it('remaps ER_NO_REFERENCED_ROW_2 from insertClaim to INVALID_REFERENCE (400)', async () => {
      const dbErr = new Error('Foreign key constraint fails');
      dbErr.code = 'ER_NO_REFERENCED_ROW_2';
      insertClaim.mockRejectedValue(dbErr);
      await expect(raiseClaim(VALID_PAYLOAD)).rejects.toMatchObject({
        status: 400,
        code: 'INVALID_REFERENCE',
      });
      expect(mockConn.rollback).toHaveBeenCalledOnce();
      expect(mockConn.release).toHaveBeenCalledOnce();
    });

    it('rolls back and releases if item lookup throws unexpectedly', async () => {
      findItemById.mockRejectedValue(new Error('Unexpected DB failure'));
      await expect(raiseClaim(VALID_PAYLOAD)).rejects.toThrow('Unexpected DB failure');
      expect(mockConn.rollback).toHaveBeenCalledOnce();
      expect(mockConn.release).toHaveBeenCalledOnce();
    });
  });
});

// ── getClaimById() ────────────────────────────────────────────────────────────

describe('getClaimById()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findClaimById.mockResolvedValue(DB_CLAIM);
  });

  it('returns the claim for a valid ID', async () => {
    const result = await getClaimById(CLAIM_ID);
    expect(result).toEqual(DB_CLAIM);
    expect(findClaimById).toHaveBeenCalledWith(pool, CLAIM_ID);
  });

  it('returns null when the claim does not exist', async () => {
    findClaimById.mockResolvedValue(null);
    const result = await getClaimById(999);
    expect(result).toBeNull();
  });

  it('throws VALIDATION_ERROR (400) for a non-positive ID', async () => {
    await expect(getClaimById(0)).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
    });
  });

  it('throws VALIDATION_ERROR (400) for a negative ID', async () => {
    await expect(getClaimById(-1)).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
    });
  });

  it('throws VALIDATION_ERROR (400) for a non-numeric string ID', async () => {
    await expect(getClaimById('abc')).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
    });
  });

  it('does not open a transaction — uses pool directly', async () => {
    await getClaimById(CLAIM_ID);
    expect(pool.getConnection).not.toHaveBeenCalled();
  });
});

// ── listClaims ────────────────────────────────────────────────────────────────

describe('listClaims()', () => {
  beforeEach(() => vi.clearAllMocks());

  it('successfully retrieves claims with valid actorId', async () => {
    const fakeResult = { claims: [DB_CLAIM], total: 1, page: 1, pageSize: 20 };
    findClaims.mockResolvedValue(fakeResult);

    const result = await listClaims({}, {}, { actorId: 2 });
    expect(result).toEqual(fakeResult);
    expect(findClaims).toHaveBeenCalledWith(pool, {}, {});
  });

  it('throws VALIDATION_ERROR (400) if actorId is missing or invalid', async () => {
    await expect(listClaims({}, {}, {})).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
    });

    await expect(listClaims({}, {}, { actorId: 'abc' })).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
    });
  });
});

// ── reviewClaim ───────────────────────────────────────────────────────────────

describe('reviewClaim()', () => {
  let mockConn;
  const ACTOR_ID = 2;
  const CONTEXT = { actorId: ACTOR_ID, requestId: 'req-1', ipAddress: '127.0.0.1' };

  beforeEach(() => {
    vi.clearAllMocks();
    mockConn = makeMockConn();
    pool.getConnection.mockResolvedValue(mockConn);
  });

  it('successfully approves a pending claim, deactivates item, and writes audits', async () => {
    const pendingClaim = { ...DB_CLAIM, claim_status: 'pending' };
    const acceptedClaim = {
      ...DB_CLAIM,
      claim_status: 'accepted',
      processed_by: ACTOR_ID,
      processing_notes: 'Verified ID',
    };
    const activeItem = { item_id: 42, item_status: 'active' };

    findClaimById
      .mockResolvedValueOnce(pendingClaim)
      .mockResolvedValueOnce(acceptedClaim);
    findItemById.mockResolvedValueOnce(activeItem);

    const result = await reviewClaim(
      CLAIM_ID,
      { status: 'accepted', processingNotes: 'Verified ID' },
      CONTEXT,
    );

    expect(result).toEqual(acceptedClaim);
    expect(mockConn.beginTransaction).toHaveBeenCalled();
    expect(archiveItem).toHaveBeenCalledWith(mockConn, 42);
    expect(updateClaimStatus).toHaveBeenCalledWith(
      mockConn,
      CLAIM_ID,
      expect.objectContaining({
        status: 'accepted',
        processedBy: ACTOR_ID,
        processingNotes: 'Verified ID',
      }),
    );
    // Audit for item update and claim update
    expect(writeAudit).toHaveBeenCalledTimes(2);
    expect(writeAudit).toHaveBeenNthCalledWith(
      1,
      mockConn,
      expect.objectContaining({
        tableName: 'items',
        recordId: 42,
        action: 'UPDATE',
        actorId: ACTOR_ID,
      }),
    );
    expect(writeAudit).toHaveBeenNthCalledWith(
      2,
      mockConn,
      expect.objectContaining({
        tableName: 'claims',
        recordId: CLAIM_ID,
        action: 'UPDATE',
        actorId: ACTOR_ID,
      }),
    );
    expect(mockConn.commit).toHaveBeenCalled();
    expect(mockConn.release).toHaveBeenCalled();
  });

  it('successfully rejects a pending claim without touching the item', async () => {
    const pendingClaim = { ...DB_CLAIM, claim_status: 'pending' };
    const rejectedClaim = {
      ...DB_CLAIM,
      claim_status: 'rejected',
      processed_by: ACTOR_ID,
      processing_notes: 'Insufficient proof',
    };

    findClaimById
      .mockResolvedValueOnce(pendingClaim)
      .mockResolvedValueOnce(rejectedClaim);

    const result = await reviewClaim(
      CLAIM_ID,
      { status: 'rejected', processingNotes: 'Insufficient proof' },
      CONTEXT,
    );

    expect(result).toEqual(rejectedClaim);
    expect(archiveItem).not.toHaveBeenCalled();
    expect(writeAudit).toHaveBeenCalledTimes(1);
    expect(writeAudit).toHaveBeenCalledWith(
      mockConn,
      expect.objectContaining({
        tableName: 'claims',
        recordId: CLAIM_ID,
        action: 'UPDATE',
        actorId: ACTOR_ID,
      }),
    );
    expect(mockConn.commit).toHaveBeenCalled();
    expect(mockConn.release).toHaveBeenCalled();
  });

  it('throws CLAIM_ALREADY_REVIEWED (409) if claim is already accepted', async () => {
    findClaimById.mockResolvedValueOnce({ ...DB_CLAIM, claim_status: 'accepted' });

    await expect(
      reviewClaim(CLAIM_ID, { status: 'accepted' }, CONTEXT),
    ).rejects.toMatchObject({
      status: 409,
      code: 'CLAIM_ALREADY_REVIEWED',
    });
    expect(mockConn.rollback).toHaveBeenCalled();
    expect(mockConn.release).toHaveBeenCalled();
  });

  it('throws CLAIM_ALREADY_REVIEWED (409) if claim is already rejected', async () => {
    findClaimById.mockResolvedValueOnce({ ...DB_CLAIM, claim_status: 'rejected' });

    await expect(
      reviewClaim(CLAIM_ID, { status: 'rejected' }, CONTEXT),
    ).rejects.toMatchObject({
      status: 409,
      code: 'CLAIM_ALREADY_REVIEWED',
    });
    expect(mockConn.rollback).toHaveBeenCalled();
    expect(mockConn.release).toHaveBeenCalled();
  });

  it('throws NOT_FOUND (404) if claim does not exist', async () => {
    findClaimById.mockResolvedValueOnce(null);

    await expect(
      reviewClaim(CLAIM_ID, { status: 'accepted' }, CONTEXT),
    ).rejects.toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
    });
    expect(mockConn.rollback).toHaveBeenCalled();
    expect(mockConn.release).toHaveBeenCalled();
  });

  it('throws VALIDATION_ERROR (400) if status is invalid', async () => {
    await expect(
      reviewClaim(CLAIM_ID, { status: 'invalid_status' }, CONTEXT),
    ).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
    });
    expect(pool.getConnection).not.toHaveBeenCalled();
  });

  it('throws VALIDATION_ERROR (400) if claimId is invalid', async () => {
    await expect(
      reviewClaim('not-a-number', { status: 'accepted' }, CONTEXT),
    ).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
    });
    expect(pool.getConnection).not.toHaveBeenCalled();
  });

  it('throws VALIDATION_ERROR (400) if actorId is invalid', async () => {
    await expect(
      reviewClaim(CLAIM_ID, { status: 'accepted' }, { actorId: null }),
    ).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
    });
    expect(pool.getConnection).not.toHaveBeenCalled();
  });

  it('throws VALIDATION_ERROR (400) if processingNotes exceed 2000 characters', async () => {
    const longNotes = 'a'.repeat(2001);
    await expect(
      reviewClaim(CLAIM_ID, { status: 'accepted', processingNotes: longNotes }, CONTEXT),
    ).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
    });
    expect(pool.getConnection).not.toHaveBeenCalled();
  });

  it('rolls back and releases connection when updateClaimStatus fails', async () => {
    findClaimById.mockResolvedValueOnce({ ...DB_CLAIM, claim_status: 'pending' });
    updateClaimStatus.mockRejectedValueOnce(new Error('DB failure'));

    await expect(
      reviewClaim(CLAIM_ID, { status: 'rejected' }, CONTEXT),
    ).rejects.toThrow('DB failure');

    expect(mockConn.rollback).toHaveBeenCalled();
    expect(mockConn.release).toHaveBeenCalled();
  });

  it('rolls back and releases connection when writeAudit fails', async () => {
    findClaimById
      .mockResolvedValueOnce({ ...DB_CLAIM, claim_status: 'pending' })
      .mockResolvedValueOnce({ ...DB_CLAIM, claim_status: 'rejected' });
    updateClaimStatus.mockResolvedValueOnce();
    writeAudit.mockRejectedValueOnce(new Error('Audit failure'));

    await expect(
      reviewClaim(CLAIM_ID, { status: 'rejected' }, CONTEXT),
    ).rejects.toThrow('Audit failure');

    expect(mockConn.rollback).toHaveBeenCalled();
    expect(mockConn.release).toHaveBeenCalled();
  });
});


// ── AppError structural check ─────────────────────────────────────────────────

describe('AppError integrity', () => {
  it('is operational and has correct prototype chain', () => {
    const err = new AppError('test', { status: 400, code: 'TEST_CODE' });
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AppError);
    expect(err.isOperational).toBe(true);
    expect(err.name).toBe('AppError');
    expect(err.status).toBe(400);
    expect(err.code).toBe('TEST_CODE');
  });
});
