import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../services/items-service.js', () => ({
  listItems: vi.fn(),
  getItemById: vi.fn(),
  addItem: vi.fn(),
  editItem: vi.fn(),
  archiveItem: vi.fn(),
}));

import {
  listItemsHandler,
  getItemHandler,
  createItemHandler,
  updateItemHandler,
  archiveItemHandler,
} from '../../controllers/item-controller.js';
import * as itemsService from '../../services/items-service.js';

function makeRes() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.end = vi.fn().mockReturnValue(res);
  return res;
}

describe('Item Controller', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('listItemsHandler', () => {
    it('returns 200 with data and meta for public user', async () => {
      const fakeResult = { items: [{ item_id: 1, title: 'Umbrella' }], total: 1, page: 1, pageSize: 20 };
      itemsService.listItems.mockResolvedValue(fakeResult);

      const req = { query: { page: '1', pageSize: '20' }, actorId: null };
      const res = makeRes();
      const next = vi.fn();

      await listItemsHandler(req, res, next);

      expect(itemsService.listItems).toHaveBeenCalledWith(
        expect.any(Object),
        { page: '1', pageSize: '20' },
        { isPublic: true },
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        data: fakeResult.items,
        meta: { page: 1, pageSize: 20, total: 1 },
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('sets isPublic to false when staff actorId is present', async () => {
      const fakeResult = { items: [], total: 0, page: 1, pageSize: 20 };
      itemsService.listItems.mockResolvedValue(fakeResult);

      const req = { query: {}, actorId: 5 };
      const res = makeRes();
      const next = vi.fn();

      await listItemsHandler(req, res, next);

      expect(itemsService.listItems).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(Object),
        { isPublic: false },
      );
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('forwards error to next() when service fails', async () => {
      const err = new Error('Service error');
      itemsService.listItems.mockRejectedValue(err);

      const req = { query: {} };
      const res = makeRes();
      const next = vi.fn();

      await listItemsHandler(req, res, next);

      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('getItemHandler', () => {
    it('returns 200 with item data when found', async () => {
      const fakeItem = { item_id: 10, title: 'Wallet' };
      itemsService.getItemById.mockResolvedValue(fakeItem);

      const req = { params: { id: '10' }, actorId: null };
      const res = makeRes();
      const next = vi.fn();

      await getItemHandler(req, res, next);

      expect(itemsService.getItemById).toHaveBeenCalledWith('10', { isPublic: true });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ data: fakeItem });
    });

    it('forwards 404 AppError when item is null', async () => {
      itemsService.getItemById.mockResolvedValue(null);

      const req = { params: { id: '999' }, actorId: null };
      const res = makeRes();
      const next = vi.fn();

      await getItemHandler(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ status: 404, code: 'NOT_FOUND' }),
      );
    });
  });

  describe('createItemHandler', () => {
    it('returns 201 with created item', async () => {
      const createdItem = { item_id: 1, title: 'Keys' };
      itemsService.addItem.mockResolvedValue(createdItem);

      const req = {
        body: { title: 'Keys' },
        actorId: 2,
        id: 'req-123',
        ip: '192.168.1.1',
      };
      const res = makeRes();
      const next = vi.fn();

      await createItemHandler(req, res, next);

      expect(itemsService.addItem).toHaveBeenCalledWith(
        { title: 'Keys' },
        { actorId: 2, requestId: 'req-123', ipAddress: '192.168.1.1' },
      );
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({ data: createdItem });
    });

    it('forwards error to next() on validation failure', async () => {
      const err = new Error('Validation error');
      itemsService.addItem.mockRejectedValue(err);

      const req = { body: {}, actorId: 2 };
      const res = makeRes();
      const next = vi.fn();

      await createItemHandler(req, res, next);

      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('updateItemHandler', () => {
    it('returns 200 with updated item', async () => {
      const updatedItem = { item_id: 1, title: 'Updated' };
      itemsService.editItem.mockResolvedValue(updatedItem);

      const req = {
        params: { id: '1' },
        body: { title: 'Updated' },
        actorId: 2,
        id: 'req-456',
        ip: '127.0.0.1',
      };
      const res = makeRes();
      const next = vi.fn();

      await updateItemHandler(req, res, next);

      expect(itemsService.editItem).toHaveBeenCalledWith(
        '1',
        { title: 'Updated' },
        { actorId: 2, requestId: 'req-456', ipAddress: '127.0.0.1' },
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ data: updatedItem });
    });
  });

  describe('archiveItemHandler', () => {
    it('returns 204 on successful soft-archive', async () => {
      itemsService.archiveItem.mockResolvedValue();

      const req = {
        params: { id: '1' },
        actorId: 1,
        id: 'req-789',
        ip: '127.0.0.1',
      };
      const res = makeRes();
      const next = vi.fn();

      await archiveItemHandler(req, res, next);

      expect(itemsService.archiveItem).toHaveBeenCalledWith('1', {
        actorId: 1,
        requestId: 'req-789',
        ipAddress: '127.0.0.1',
      });
      expect(res.status).toHaveBeenCalledWith(204);
      expect(res.end).toHaveBeenCalled();
    });
  });
});
