import { Router } from 'express';
import { authMiddleware, AuthPayload, tenantMiddleware } from '../middleware/auth.js';
import { getTenant, getTenantDb } from '../middleware/tenant.js';
import {
  applyMovement,
  applyAdjustment,
  stockStatus,
  InsufficientStockError,
} from '../services/stock.js';

const router = Router();

router.use(authMiddleware, tenantMiddleware);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

    let toDate: Date | undefined;
    if (to) {
      toDate = new Date(to);
      toDate.setHours(23, 59, 59, 999);
    }

    const result = await getTenantDb(req).listMovements({
      productId: productId && UUID_RE.test(productId) ? productId : undefined,
      from: from ? new Date(from) : undefined,
      to: toDate,
      type,
      page: pageNumber,
      pageSize,
    });

    res.json({
      items: result.items,
      total: result.total,
      page: pageNumber,
      pageSize,
      totalPages: Math.max(1, Math.ceil(result.total / pageSize)),
    });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.get('/movements/product/:productId', async (req, res) => {
  try {
    if (!UUID_RE.test(req.params.productId)) {
      return res.status(400).json({ error: 'Invalid product id' });
    }
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;
    let toDate: Date | undefined;
    if (to) {
      toDate = new Date(to);
      toDate.setHours(23, 59, 59, 999);
    }
    const result = await getTenantDb(req).listMovements({
      productId: req.params.productId,
      from: from ? new Date(from) : undefined,
      to: toDate,
      page: 1,
      pageSize: 200,
    });
    res.json(result.items);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.post('/stock-in', async (req, res) => {
  try {
    const { productId, quantity, date, notes, referenceLabel, costPrice } = req.body as {
      productId: string;
      quantity: number;
      date?: string;
      notes?: string;
      referenceLabel?: string;
      costPrice?: number;
    };
    if (!productId || quantity == null) {
      return res.status(400).json({ error: 'productId and quantity are required' });
    }
    const parsedCost = costPrice != null ? Math.max(0, Number(costPrice)) : undefined;
    if (parsedCost != null && !Number.isFinite(parsedCost)) {
      return res.status(400).json({ error: 'Invalid cost price' });
    }
    const result = await applyMovement(getTenant(req).schemaName, {
      productId,
      type: 'STOCK_IN',
      quantity: Number(quantity),
      date: date ? new Date(date) : undefined,
      reference: { referenceType: 'manual', referenceLabel: referenceLabel ?? '' },
      notes: notes ?? '',
      user: getUser(req as { user?: AuthPayload }),
      costPrice: parsedCost,
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
    const result = await applyAdjustment(getTenant(req).schemaName, {
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
    const products = await getTenantDb(req).listProducts(q);

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
    const products = await getTenantDb(req).lowStockProducts();
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
