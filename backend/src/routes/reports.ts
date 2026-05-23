import { Router } from 'express';
import { authMiddleware, tenantMiddleware } from '../middleware/auth.js';
import { getTenantDb } from '../middleware/tenant.js';
import { stockStatus } from '../services/stock.js';

const router = Router();

router.use(authMiddleware, tenantMiddleware);

router.get('/sales', async (req, res) => {
  try {
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;
    const report = await getTenantDb(req).salesReport(
      from ? new Date(from) : undefined,
      to ? new Date(to) : undefined
    );
    res.json({
      summary: report.summary,
      byDay: report.byDay,
    });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.get('/inventory', async (req, res) => {
  try {
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;
    let toDate: Date | undefined;
    if (to) {
      toDate = new Date(to);
      toDate.setHours(23, 59, 59, 999);
    }

    const report = await getTenantDb(req).inventoryReport(
      from ? new Date(from) : undefined,
      toDate
    );

    const summaryItems = report.products.map((p) => ({
      id: p.id,
      name: p.name,
      barcode: p.barcode,
      quantityOnHand: p.quantityOnHand ?? 0,
      reorderLevel: p.reorderLevel ?? 0,
      status: stockStatus(p.quantityOnHand ?? 0, p.reorderLevel ?? 0),
      stockValue: (p.costPrice ?? 0) * (p.quantityOnHand ?? 0),
    }));

    res.json({
      movementSummary: report.movementSummary.map((m) => ({
        type: m.type,
        totalQuantity: m.totalQuantity,
        count: m.count,
      })),
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
