import { Router } from 'express';
import { generateBarcodeImage } from '../services/barcode.js';
import { applyMovement } from '../services/stock.js';
import { authMiddleware, tenantMiddleware } from '../middleware/auth.js';
import { getTenantDb } from '../middleware/tenant.js';

const router = Router();

router.use(authMiddleware, tenantMiddleware);

router.get('/', async (req, res) => {
  try {
    const q = (req.query.q as string) || '';
    const products = await getTenantDb(req).listProducts(q);
    res.json(products);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.get('/by-barcode/:barcode', async (req, res) => {
  try {
    const product = await getTenantDb(req).getProductByBarcode(req.params.barcode);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json(product);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.get('/:id/barcode.png', async (req, res) => {
  try {
    const product = await getTenantDb(req).getProduct(req.params.id);
    if (!product) return res.status(404).send('Product not found');
    const png = await generateBarcodeImage(product.barcode);
    res.set('Content-Type', 'image/png');
    res.send(png);
  } catch (e) {
    res.status(500).send((e as Error).message);
  }
});

router.get('/:id', async (req, res) => {
  try {
    const product = await getTenantDb(req).getProduct(req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json(product);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.post('/generate-barcode', async (req, res) => {
  try {
    const db = getTenantDb(req);
    let barcode: string;
    let exists = true;
    let attempts = 0;
    const prefix = 'BC';
    do {
      barcode =
        prefix +
        Date.now().toString(36).toUpperCase() +
        Math.random().toString(36).slice(2, 6).toUpperCase();
      exists = (await db.countProductsByBarcode(barcode)) > 0;
      attempts++;
      if (attempts > 10) {
        return res.status(500).json({ error: 'Could not generate unique barcode' });
      }
    } while (exists);
    res.json({ barcode });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.post('/', async (req, res) => {
  try {
    const tenant = getTenantDb(req);
    const { barcode, name, price, unit, description, openingQuantity, reorderLevel, costPrice } =
      req.body;
    if (!barcode || !name || price == null) {
      return res.status(400).json({ error: 'barcode, name, and price are required' });
    }
    try {
      const product = await tenant.createProduct({
        barcode: String(barcode).trim(),
        name: String(name).trim(),
        price: Number(price),
        unit: unit || 'pcs',
        description: description || '',
        reorderLevel: reorderLevel != null ? Math.max(0, Number(reorderLevel)) : 0,
        costPrice:
          costPrice != null && costPrice !== '' ? Math.max(0, Number(costPrice)) : null,
      });
      const opening = openingQuantity != null ? Math.max(0, Number(openingQuantity)) : 0;
      if (opening > 0) {
        const schemaName = (req as typeof req & { tenant: { schemaName: string } }).tenant
          .schemaName;
        await applyMovement(schemaName, {
          productId: product.id,
          type: 'OPENING',
          quantity: opening,
          notes: 'Opening stock',
        });
        const updated = await tenant.getProduct(product.id);
        return res.status(201).json(updated);
      }
      res.status(201).json(product);
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.includes('unique') || msg.includes('duplicate')) {
        return res.status(400).json({ error: 'Barcode already exists' });
      }
      throw e;
    }
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { barcode, name, price, unit, description, reorderLevel, costPrice } = req.body;
    try {
      const product = await getTenantDb(req).updateProduct(req.params.id, {
        ...(barcode !== undefined && { barcode: String(barcode).trim() }),
        ...(name !== undefined && { name: String(name).trim() }),
        ...(price !== undefined && { price: Number(price) }),
        ...(unit !== undefined && { unit }),
        ...(description !== undefined && { description }),
        ...(reorderLevel !== undefined && { reorderLevel: Math.max(0, Number(reorderLevel)) }),
        ...(costPrice !== undefined && {
          costPrice:
            costPrice === '' || costPrice == null ? null : Math.max(0, Number(costPrice)),
        }),
      });
      if (!product) return res.status(404).json({ error: 'Product not found' });
      res.json(product);
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.includes('unique') || msg.includes('duplicate')) {
        return res.status(400).json({ error: 'Barcode already exists' });
      }
      throw e;
    }
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const ok = await getTenantDb(req).deleteProduct(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Product not found' });
    res.status(204).send();
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

export default router;
