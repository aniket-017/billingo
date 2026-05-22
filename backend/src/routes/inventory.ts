import { Router } from 'express';
import mongoose from 'mongoose';
import { StockMovement } from '../models/StockMovement.js';
import { Product } from '../models/Product.js';
import { authMiddleware, AuthPayload } from '../middleware/auth.js';
import {
  applyMovement,
  applyAdjustment,
  stockStatus,
  InsufficientStockError,
} from '../services/stock.js';

const router = Router();

router.use(authMiddleware);

function getUser(req: { user?: AuthPayload }): AuthPayload | undefined {
  return req.user;
}

router.get('/movements', async (req, res) => {
  try {
    const productId = req.query.productId as string | undefined;
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;
    const type = req.query.type as string | undefined;
    const page = Number(req.query.page ?? '1');
    const limit = Number(req.query.limit ?? '50');
    const pageNumber = Number.isFinite(page) && page > 0 ? page : 1;
    const pageSize = Number.isFinite(limit) && limit > 0 && limit <= 200 ? limit : 50;

    const filter: Record<string, unknown> = {};
    if (productId && mongoose.isValidObjectId(productId)) {
      filter.productId = productId;
    }
    if (type) filter.type = type;
    if (from || to) {
      filter.date = {};
      if (from) (filter.date as Record<string, Date>).$gte = new Date(from);
      if (to) {
        const toDate = new Date(to);
        toDate.setHours(23, 59, 59, 999);
        (filter.date as Record<string, Date>).$lte = toDate;
      }
    }

    const [items, total] = await Promise.all([
      StockMovement.find(filter)
        .populate('productId', 'name barcode unit')
        .sort({ date: -1, createdAt: -1 })
        .skip((pageNumber - 1) * pageSize)
        .limit(pageSize)
        .lean(),
      StockMovement.countDocuments(filter),
    ]);

    res.json({
      items,
      total,
      page: pageNumber,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.get('/movements/product/:productId', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.productId)) {
      return res.status(400).json({ error: 'Invalid product id' });
    }
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;
    const filter: Record<string, unknown> = { productId: req.params.productId };
    if (from || to) {
      filter.date = {};
      if (from) (filter.date as Record<string, Date>).$gte = new Date(from);
      if (to) {
        const toDate = new Date(to);
        toDate.setHours(23, 59, 59, 999);
        (filter.date as Record<string, Date>).$lte = toDate;
      }
    }
    const items = await StockMovement.find(filter)
      .sort({ date: -1, createdAt: -1 })
      .limit(200)
      .lean();
    res.json(items);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.post('/stock-in', async (req, res) => {
  try {
    const { productId, quantity, date, notes, referenceLabel } = req.body as {
      productId: string;
      quantity: number;
      date?: string;
      notes?: string;
      referenceLabel?: string;
    };
    if (!productId || quantity == null) {
      return res.status(400).json({ error: 'productId and quantity are required' });
    }
    const result = await applyMovement({
      productId,
      type: 'STOCK_IN',
      quantity: Number(quantity),
      date: date ? new Date(date) : undefined,
      reference: { referenceType: 'manual', referenceLabel: referenceLabel ?? '' },
      notes: notes ?? '',
      user: getUser(req as { user?: AuthPayload }),
    });
    res.status(201).json(result);
  } catch (e) {
    if (e instanceof InsufficientStockError) {
      return res.status(400).json({ error: e.message });
    }
    res.status(500).json({ error: (e as Error).message });
  }
});

router.post('/adjust', async (req, res) => {
  try {
    const { productId, quantityDelta, date, notes } = req.body as {
      productId: string;
      quantityDelta: number;
      date?: string;
      notes?: string;
    };
    if (!productId || quantityDelta == null) {
      return res.status(400).json({ error: 'productId and quantityDelta are required' });
    }
    const result = await applyAdjustment({
      productId,
      quantityDelta: Number(quantityDelta),
      date: date ? new Date(date) : undefined,
      notes,
      user: getUser(req as { user?: AuthPayload }),
    });
    res.status(201).json(result);
  } catch (e) {
    if (e instanceof InsufficientStockError) {
      return res.status(400).json({ error: e.message });
    }
    res.status(500).json({ error: (e as Error).message });
  }
});

router.get('/summary', async (req, res) => {
  try {
    const q = (req.query.q as string) || '';
    const filter = q
      ? { $or: [{ name: new RegExp(q, 'i') }, { barcode: new RegExp(q, 'i') }] }
      : {};
    const products = await Product.find(filter)
      .select('barcode name price unit quantityOnHand reorderLevel costPrice')
      .sort({ name: 1 })
      .lean();

    const items = products.map((p) => ({
      ...p,
      status: stockStatus(p.quantityOnHand ?? 0, p.reorderLevel ?? 0),
      stockValue: (p.costPrice ?? 0) * (p.quantityOnHand ?? 0),
    }));

    res.json({
      items,
      totals: {
        productCount: items.length,
        totalUnits: items.reduce((s, i) => s + (i.quantityOnHand ?? 0), 0),
        totalStockValue: items.reduce((s, i) => s + i.stockValue, 0),
        lowStockCount: items.filter((i) => i.status === 'low').length,
        outOfStockCount: items.filter((i) => i.status === 'out').length,
      },
    });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.get('/low-stock', async (req, res) => {
  try {
    const products = await Product.find({
      reorderLevel: { $gt: 0 },
      $expr: { $lte: ['$quantityOnHand', '$reorderLevel'] },
    })
      .select('barcode name price unit quantityOnHand reorderLevel costPrice')
      .sort({ quantityOnHand: 1 })
      .lean();

    res.json(
      products.map((p) => ({
        ...p,
        status: stockStatus(p.quantityOnHand ?? 0, p.reorderLevel ?? 0),
      }))
    );
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

export default router;
