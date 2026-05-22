import { Router } from 'express';
import { Product } from '../models/Product.js';
import { generateBarcodeImage } from '../services/barcode.js';
import { applyMovement } from '../services/stock.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const q = (req.query.q as string) || '';
    const filter = q
      ? { $or: [{ name: new RegExp(q, 'i') }, { barcode: new RegExp(q, 'i') }] }
      : {};
    const products = await Product.find(filter).sort({ createdAt: -1 }).lean();
    res.json(products);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.get('/by-barcode/:barcode', async (req, res) => {
  try {
    const product = await Product.findOne({ barcode: req.params.barcode }).lean();
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json(product);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.get('/:id/barcode.png', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).lean();
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
    const product = await Product.findById(req.params.id).lean();
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json(product);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.post('/generate-barcode', async (req, res) => {
  try {
    let barcode: string;
    let exists = true;
    let attempts = 0;
    const prefix = 'BC';
    do {
      barcode = prefix + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase();
      exists = (await Product.countDocuments({ barcode })) > 0;
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
    const { barcode, name, price, unit, description, openingQuantity, reorderLevel, costPrice } = req.body;
    if (!barcode || !name || price == null) {
      return res.status(400).json({ error: 'barcode, name, and price are required' });
    }
    const product = await Product.create({
      barcode: String(barcode).trim(),
      name: String(name).trim(),
      price: Number(price),
      unit: unit || 'pcs',
      description: description || '',
      reorderLevel: reorderLevel != null ? Math.max(0, Number(reorderLevel)) : 0,
      costPrice: costPrice != null && costPrice !== '' ? Math.max(0, Number(costPrice)) : undefined,
    });
    const opening = openingQuantity != null ? Math.max(0, Number(openingQuantity)) : 0;
    if (opening > 0) {
      await applyMovement({
        productId: String(product._id),
        type: 'OPENING',
        quantity: opening,
        notes: 'Opening stock',
      });
      const updated = await Product.findById(product._id).lean();
      return res.status(201).json(updated);
    }
    res.status(201).json(product);
  } catch (e) {
    if ((e as { code?: number }).code === 11000) {
      return res.status(400).json({ error: 'Barcode already exists' });
    }
    res.status(500).json({ error: (e as Error).message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { barcode, name, price, unit, description, reorderLevel, costPrice } = req.body;
    const update: Record<string, unknown> = {};
    if (barcode !== undefined) update.barcode = String(barcode).trim();
    if (name !== undefined) update.name = String(name).trim();
    if (price !== undefined) update.price = Number(price);
    if (unit !== undefined) update.unit = unit;
    if (description !== undefined) update.description = description;
    if (reorderLevel !== undefined) update.reorderLevel = Math.max(0, Number(reorderLevel));
    if (costPrice !== undefined) {
      update.costPrice = costPrice === '' || costPrice == null ? undefined : Math.max(0, Number(costPrice));
    }
    const product = await Product.findByIdAndUpdate(req.params.id, update, { new: true }).lean();
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json(product);
  } catch (e) {
    if ((e as { code?: number }).code === 11000) {
      return res.status(400).json({ error: 'Barcode already exists' });
    }
    res.status(500).json({ error: (e as Error).message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const result = await Product.findByIdAndDelete(req.params.id);
    if (!result) return res.status(404).json({ error: 'Product not found' });
    res.status(204).send();
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

export default router;
