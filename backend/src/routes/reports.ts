import { Router } from 'express';
import { Invoice } from '../models/Invoice.js';
import { Product } from '../models/Product.js';
import { StockMovement } from '../models/StockMovement.js';
import { stockStatus } from '../services/stock.js';

const router = Router();

router.get('/sales', async (req, res) => {
  try {
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;
    const match: Record<string, unknown> = {};
    if (from || to) {
      match.date = {};
      if (from) (match.date as Record<string, Date>).$gte = new Date(from);
      if (to) (match.date as Record<string, Date>).$lte = new Date(to);
    }
    const summary = await Invoice.aggregate([
      ...(Object.keys(match).length ? [{ $match: match }] : []),
      {
        $group: {
          _id: null,
          totalSales: { $sum: '$total' },
          count: { $sum: 1 },
        },
      },
    ]);
    const byDay = await Invoice.aggregate([
      ...(Object.keys(match).length ? [{ $match: match }] : []),
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
          total: { $sum: '$total' },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);
    res.json({
      summary: summary[0] || { totalSales: 0, count: 0 },
      byDay,
    });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.get('/inventory', async (req, res) => {
  try {
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;
    const match: Record<string, unknown> = {};
    if (from || to) {
      match.date = {};
      if (from) (match.date as Record<string, Date>).$gte = new Date(from);
      if (to) {
        const toDate = new Date(to);
        toDate.setHours(23, 59, 59, 999);
        (match.date as Record<string, Date>).$lte = toDate;
      }
    }

    const [movementSummary, products] = await Promise.all([
      StockMovement.aggregate([
        ...(Object.keys(match).length ? [{ $match: match }] : []),
        {
          $group: {
            _id: '$type',
            totalQuantity: { $sum: '$quantity' },
            count: { $sum: 1 },
          },
        },
      ]),
      Product.find()
        .select('name barcode quantityOnHand reorderLevel costPrice')
        .lean(),
    ]);

    const summaryItems = products.map((p) => ({
      _id: p._id,
      name: p.name,
      barcode: p.barcode,
      quantityOnHand: p.quantityOnHand ?? 0,
      reorderLevel: p.reorderLevel ?? 0,
      status: stockStatus(p.quantityOnHand ?? 0, p.reorderLevel ?? 0),
      stockValue: (p.costPrice ?? 0) * (p.quantityOnHand ?? 0),
    }));

    res.json({
      movementSummary,
      stock: {
        productCount: summaryItems.length,
        totalUnits: summaryItems.reduce((s, i) => s + i.quantityOnHand, 0),
        totalStockValue: summaryItems.reduce((s, i) => s + i.stockValue, 0),
        lowStockCount: summaryItems.filter((i) => i.status === 'low').length,
        outOfStockCount: summaryItems.filter((i) => i.status === 'out').length,
      },
      products: summaryItems,
    });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

export default router;
