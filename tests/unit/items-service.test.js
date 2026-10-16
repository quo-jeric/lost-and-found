import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock the pool and all repository modules before importing the service ─────
// The service imports pool from config/db.js and functions from repositories.
// We replace them all with controllable fakes so no real DB is touched.

vi.mock('../../config/db.js', () => ({
  pool: {
    getConnection: vi.fn(),
  },
  default: { getConnection: vi.fn() },
}));

vi.mock('../../repositories/item-repository.js', () => ({
  findItemById: vi.fn(),
  insertItem: vi.fn(),
  updateItem: vi.fn(),
}));

vi.mock('../../repositories/audit-repository.js', () => ({
  writeAudit: vi.fn(),
}));

// Now import the service (mocks are in place)
import { addItem, editItem, getItemById } from '../../services/items-service.js';
import { pool } from '../../config/db.js';
import { findItemById, insertItem, updateItem } from '../../repositories/item-repository.js';
import { writeAudit } from '../../repositories/audit-repository.js';
import { AppError } from '../../utils/app-error.js';

// ── Shared test fixtures ──────────────────────────────────────────────────────

const ACTOR_ID = 1;

const VALID_PAYLOAD = {
  title: 'Blue Hydro Flask',
  description: 'Large 32oz bottle with stickers',
  category_id: 2,
  color: 'Blue',
  brand: 'Hydro Flask',
  serial_number: null,
  found_at: '2026-10-10T08:00:00.000Z',
  location_id: 3,
  finder_name: 'Juan dela Cruz',
  storage_notes: 'Cabinet A, Shelf 2',
  item_status: 'active',
  image_url: null,
};

const DB_ITEM = {
  item_id: 42,
  ...VALID_PAYLOAD,
  found_at: '2026-10-10 08:00:00',
  logged_by: ACTOR_ID,
  created_at: new Date('2026-10-10T08:05:00Z'),
  updated_at: new Date('2026-10-10T08:05:00Z'),
};

/** Build a mock transaction connection */
function makeMockConn() {
  return {
    beginTransaction: vi.fn().mockResolvedValue(undefined),
    commit: vi.fn().mockResolvedValue(undefined),
    rollback: vi.fn().mockResolvedValue(undefined),
    release: vi.fn(),
    execute: vi.fn(),
  };
}

// ── addItem ───────────────────────────────────────────────────────────────────

describe('addItem()', () => {
  let conn;

  beforeEach(() => {
    vi.clearAllMocks();
    conn = makeMockConn();
    pool.getConnection.mockResolvedValue(conn);
  });

  // ── Happy path ──────────────────────────────────────────────────────────────

  it('returns the created item when all required fields are valid', async () => {
    insertItem.mockResolvedValue(42);
    findItemById.mockResolvedValue(DB_ITEM);
    writeAudit.mockResolvedValue(1);

    const result = await addItem(VALID_PAYLOAD, { actorId: ACTOR_ID });

    expect(result).toEqual(DB_ITEM);
  });

  it('opens a transaction, inserts the item, writes an audit row, then commits', async () => {
    insertItem.mockResolvedValue(42);
    findItemById.mockResolvedValue(DB_ITEM);
    writeAudit.mockResolvedValue(1);

    await addItem(VALID_PAYLOAD, { actorId: ACTOR_ID });

    expect(conn.beginTransaction).toHaveBeenCalledOnce();
    expect(insertItem).toHaveBeenCalledOnce();

    // logged_by is set to actorId by the service
    expect(insertItem).toHaveBeenCalledWith(conn, expect.objectContaining({ logged_by: ACTOR_ID }));

    expect(writeAudit).toHaveBeenCalledWith(conn, expect.objectContaining({
      tableName: 'items',
      recordId: 42,
      action: 'INSERT',
      actorId: ACTOR_ID,
      newValues: DB_ITEM,
    }));

    expect(conn.commit).toHaveBeenCalledOnce();
    expect(conn.rollback).not.toHaveBeenCalled();
    expect(conn.release).toHaveBeenCalledOnce();
  });

  it('passes requestId and ipAddress to writeAudit', async () => {
    insertItem.mockResolvedValue(42);
    findItemById.mockResolvedValue(DB_ITEM);
    writeAudit.mockResolvedValue(1);

    await addItem(VALID_PAYLOAD, {
      actorId: ACTOR_ID,
      requestId: 'req-abc-123',
      ipAddress: '127.0.0.1',
    });

    expect(writeAudit).toHaveBeenCalledWith(conn, expect.objectContaining({
      requestId: 'req-abc-123',
      ipAddress: '127.0.0.1',
    }));
  });

  // ── Rollback on failure ─────────────────────────────────────────────────────

  it('rolls back the transaction and releases the connection when insertItem throws', async () => {
    insertItem.mockRejectedValue(new Error('DB insert failed'));

    await expect(addItem(VALID_PAYLOAD, { actorId: ACTOR_ID })).rejects.toThrow('DB insert failed');

    expect(conn.rollback).toHaveBeenCalledOnce();
    expect(conn.commit).not.toHaveBeenCalled();
    expect(conn.release).toHaveBeenCalledOnce();
  });

  it('rolls back and rethrows when writeAudit throws', async () => {
    insertItem.mockResolvedValue(42);
    findItemById.mockResolvedValue(DB_ITEM);
    writeAudit.mockRejectedValue(new Error('Audit table locked'));

    await expect(addItem(VALID_PAYLOAD, { actorId: ACTOR_ID })).rejects.toThrow('Audit table locked');

    expect(conn.rollback).toHaveBeenCalledOnce();
    expect(conn.release).toHaveBeenCalledOnce();
  });

  // ── Validation failures ─────────────────────────────────────────────────────

  it('throws VALIDATION_ERROR(400) when title is missing', async () => {
    const { title: _t, ...noTitle } = VALID_PAYLOAD;
    await expect(addItem(noTitle, { actorId: ACTOR_ID })).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
    });
    expect(conn.beginTransaction).not.toHaveBeenCalled();
  });

  it('throws VALIDATION_ERROR(400) when title exceeds 255 chars', async () => {
    const payload = { ...VALID_PAYLOAD, title: 'A'.repeat(256) };
    await expect(addItem(payload, { actorId: ACTOR_ID })).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
    });
  });

  it('throws VALIDATION_ERROR(400) when category_id is missing', async () => {
    const { category_id: _c, ...noCat } = VALID_PAYLOAD;
    await expect(addItem(noCat, { actorId: ACTOR_ID })).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
    });
  });

  it('throws VALIDATION_ERROR(400) when category_id is not a positive integer', async () => {
    const payload = { ...VALID_PAYLOAD, category_id: -1 };
    await expect(addItem(payload, { actorId: ACTOR_ID })).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
    });
  });

  it('throws VALIDATION_ERROR(400) when location_id is zero', async () => {
    const payload = { ...VALID_PAYLOAD, location_id: 0 };
    await expect(addItem(payload, { actorId: ACTOR_ID })).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
    });
  });

  it('throws VALIDATION_ERROR(400) when finder_name is missing', async () => {
    const { finder_name: _f, ...noFinder } = VALID_PAYLOAD;
    await expect(addItem(noFinder, { actorId: ACTOR_ID })).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
    });
  });

  it('throws VALIDATION_ERROR(400) when finder_name exceeds 75 chars', async () => {
    const payload = { ...VALID_PAYLOAD, finder_name: 'B'.repeat(76) };
    await expect(addItem(payload, { actorId: ACTOR_ID })).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
    });
  });

  it('throws VALIDATION_ERROR(400) when found_at is missing', async () => {
    const { found_at: _d, ...noDate } = VALID_PAYLOAD;
    await expect(addItem(noDate, { actorId: ACTOR_ID })).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
    });
  });

  it('throws VALIDATION_ERROR(400) when found_at is in the future', async () => {
    const futureDate = new Date(Date.now() + 86_400_000).toISOString();
    const payload = { ...VALID_PAYLOAD, found_at: futureDate };
    await expect(addItem(payload, { actorId: ACTOR_ID })).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
    });
  });

  it('throws VALIDATION_ERROR(400) when found_at is not a valid date', async () => {
    const payload = { ...VALID_PAYLOAD, found_at: 'not-a-date' };
    await expect(addItem(payload, { actorId: ACTOR_ID })).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
    });
  });

  it('throws VALIDATION_ERROR(400) when item_status is not a recognized value', async () => {
    const payload = { ...VALID_PAYLOAD, item_status: 'unknown' };
    await expect(addItem(payload, { actorId: ACTOR_ID })).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
    });
  });

  it('accepts item_status "inactive"', async () => {
    insertItem.mockResolvedValue(42);
    findItemById.mockResolvedValue({ ...DB_ITEM, item_status: 'inactive' });
    writeAudit.mockResolvedValue(1);

    const result = await addItem({ ...VALID_PAYLOAD, item_status: 'inactive' }, { actorId: ACTOR_ID });
    expect(result.item_status).toBe('inactive');
  });

  it('throws VALIDATION_ERROR(400) when actorId is missing', async () => {
    await expect(addItem(VALID_PAYLOAD, { actorId: null })).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
    });
    expect(conn.beginTransaction).not.toHaveBeenCalled();
  });

  it('throws VALIDATION_ERROR(400) when actorId is zero', async () => {
    await expect(addItem(VALID_PAYLOAD, { actorId: 0 })).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
    });
  });

  it('remaps ER_NO_REFERENCED_ROW_2 to INVALID_REFERENCE(400)', async () => {
    const dbErr = Object.assign(new Error('FK constraint'), { code: 'ER_NO_REFERENCED_ROW_2' });
    insertItem.mockRejectedValue(dbErr);

    await expect(addItem(VALID_PAYLOAD, { actorId: ACTOR_ID })).rejects.toMatchObject({
      status: 400,
      code: 'INVALID_REFERENCE',
    });
    expect(conn.rollback).toHaveBeenCalledOnce();
  });
});

// ── editItem ──────────────────────────────────────────────────────────────────

describe('editItem()', () => {
  let conn;

  beforeEach(() => {
    vi.clearAllMocks();
    conn = makeMockConn();
    pool.getConnection.mockResolvedValue(conn);
  });

  const UPDATED_ITEM = { ...DB_ITEM, title: 'Red Thermos', updated_at: new Date() };

  // ── Happy path ──────────────────────────────────────────────────────────────

  it('returns the updated item when called with valid arguments', async () => {
    findItemById
      .mockResolvedValueOnce(DB_ITEM)   // forUpdate fetch
      .mockResolvedValueOnce(UPDATED_ITEM); // post-update fetch
    updateItem.mockResolvedValue(undefined);
    writeAudit.mockResolvedValue(2);

    const result = await editItem(42, { title: 'Red Thermos' }, { actorId: ACTOR_ID });

    expect(result).toEqual(UPDATED_ITEM);
  });

  it('opens a transaction, updates item, writes audit row with old/new values, then commits', async () => {
    findItemById
      .mockResolvedValueOnce(DB_ITEM)
      .mockResolvedValueOnce(UPDATED_ITEM);
    updateItem.mockResolvedValue(undefined);
    writeAudit.mockResolvedValue(2);

    await editItem(42, { title: 'Red Thermos' }, { actorId: ACTOR_ID });

    expect(conn.beginTransaction).toHaveBeenCalledOnce();

    expect(updateItem).toHaveBeenCalledWith(conn, 42, expect.objectContaining({ title: 'Red Thermos' }));

    expect(writeAudit).toHaveBeenCalledWith(conn, expect.objectContaining({
      tableName: 'items',
      recordId: 42,
      action: 'UPDATE',
      actorId: ACTOR_ID,
      oldValues: DB_ITEM,
      newValues: UPDATED_ITEM,
    }));

    expect(conn.commit).toHaveBeenCalledOnce();
    expect(conn.rollback).not.toHaveBeenCalled();
    expect(conn.release).toHaveBeenCalledOnce();
  });

  it('does not update logged_by even if supplied in updateData', async () => {
    findItemById
      .mockResolvedValueOnce(DB_ITEM)
      .mockResolvedValueOnce(UPDATED_ITEM);
    updateItem.mockResolvedValue(undefined);
    writeAudit.mockResolvedValue(2);

    await editItem(42, { title: 'Red Thermos', logged_by: 999 }, { actorId: ACTOR_ID });

    // logged_by must NOT appear in the fields passed to updateItem
    const [, , fields] = updateItem.mock.calls[0];
    expect(fields).not.toHaveProperty('logged_by');
  });

  // ── Not-found ───────────────────────────────────────────────────────────────

  it('throws NOT_FOUND(404) when the item does not exist', async () => {
    findItemById.mockResolvedValueOnce(null); // item not found

    await expect(editItem(99, { title: 'Ghost' }, { actorId: ACTOR_ID })).rejects.toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
    });

    expect(conn.rollback).toHaveBeenCalledOnce();
    expect(conn.commit).not.toHaveBeenCalled();
    expect(conn.release).toHaveBeenCalledOnce();
  });

  // ── Rollback on failure ─────────────────────────────────────────────────────

  it('rolls back and rethrows when updateItem throws', async () => {
    findItemById.mockResolvedValueOnce(DB_ITEM);
    updateItem.mockRejectedValue(new Error('Update failed'));

    await expect(editItem(42, { title: 'Red Thermos' }, { actorId: ACTOR_ID })).rejects.toThrow('Update failed');

    expect(conn.rollback).toHaveBeenCalledOnce();
    expect(conn.release).toHaveBeenCalledOnce();
  });

  // ── Validation failures ─────────────────────────────────────────────────────

  it('throws VALIDATION_ERROR(400) when no editable fields are supplied', async () => {
    await expect(editItem(42, {}, { actorId: ACTOR_ID })).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
    });
    expect(conn.beginTransaction).not.toHaveBeenCalled();
  });

  it('throws VALIDATION_ERROR(400) when itemId is invalid', async () => {
    await expect(editItem('abc', { title: 'Test' }, { actorId: ACTOR_ID })).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
    });
  });

  it('throws VALIDATION_ERROR(400) when title is set to an empty string', async () => {
    await expect(editItem(42, { title: '   ' }, { actorId: ACTOR_ID })).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
    });
    expect(conn.beginTransaction).not.toHaveBeenCalled();
  });

  it('throws VALIDATION_ERROR(400) when found_at is in the future', async () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    await expect(editItem(42, { found_at: future }, { actorId: ACTOR_ID })).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
    });
  });

  it('throws VALIDATION_ERROR(400) when item_status is invalid', async () => {
    await expect(editItem(42, { item_status: 'deleted' }, { actorId: ACTOR_ID })).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
    });
  });

  it('remaps ER_NO_REFERENCED_ROW_2 to INVALID_REFERENCE(400)', async () => {
    findItemById.mockResolvedValueOnce(DB_ITEM);
    const dbErr = Object.assign(new Error('FK constraint'), { code: 'ER_NO_REFERENCED_ROW_2' });
    updateItem.mockRejectedValue(dbErr);

    await expect(editItem(42, { category_id: 9999 }, { actorId: ACTOR_ID })).rejects.toMatchObject({
      status: 400,
      code: 'INVALID_REFERENCE',
    });
    expect(conn.rollback).toHaveBeenCalledOnce();
  });
});

// ── getItemById ───────────────────────────────────────────────────────────────

describe('getItemById()', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns an item for a valid id', async () => {
    findItemById.mockResolvedValue(DB_ITEM);
    const result = await getItemById(42);
    expect(result).toEqual(DB_ITEM);
  });

  it('returns null when the item does not exist', async () => {
    findItemById.mockResolvedValue(null);
    const result = await getItemById(999);
    expect(result).toBeNull();
  });

  it('throws VALIDATION_ERROR(400) for an invalid id', async () => {
    await expect(getItemById(0)).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
    });
  });
});

// ── AppError shape ────────────────────────────────────────────────────────────

describe('AppError', () => {
  it('is an instance of Error with isOperational=true', () => {
    const err = new AppError('test', { status: 404, code: 'NOT_FOUND' });
    expect(err).toBeInstanceOf(Error);
    expect(err.isOperational).toBe(true);
    expect(err.status).toBe(404);
    expect(err.code).toBe('NOT_FOUND');
  });
});
