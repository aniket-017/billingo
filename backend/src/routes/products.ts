import { Router } from 'express';
import { generateBarcodeImage } from '../services/barcode.js';
import {
  extractProductNameFromLabelText,
  isProductNameAiConfigured,
} from '../services/productNameAi.js';
import {
  isInvoiceParseAiConfigured,
  parseInvoiceOcr,
} from '../services/invoiceParseAi.js';
import { applyMovement } from '../services/stock.js';
import { authMiddleware, tenantMiddleware } from '../middleware/auth.js';
import { getTenantDb } from '../middleware/tenant.js';

const MAX_OCR_TEXT_LENGTH = 8000;

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

router.post('/extract-name', async (req, res) => {
  try {
    if (!isProductNameAiConfigured()) {
      return res.status(503).json({ error: 'Product name AI is not configured' });
    }

    const ocrText = typeof req.body?.ocrText === 'string' ? req.body.ocrText.trim() : '';
    if (!ocrText) {
      return res.status(400).json({ error: 'ocrText is required' });
    }
    if (ocrText.length > MAX_OCR_TEXT_LENGTH) {
      return res.status(400).json({
        error: `ocrText must be at most ${MAX_OCR_TEXT_LENGTH} characters`,
      });
    }

    const name = await extractProductNameFromLabelText(ocrText);
    if (!name) {
      return res.status(502).json({ error: 'Could not extract a product name' });
    }
    res.json({ name });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === 'AI_NOT_CONFIGURED' || msg === 'DEEPSEEK_NOT_CONFIGURED' || msg === 'GEMINI_NOT_CONFIGURED') {
      return res.status(503).json({ error: 'Product name AI is not configured' });
    }
    res.status(502).json({ error: msg || 'Product name extraction failed' });
  }
});

router.post('/parse-invoice', async (req, res) => {
  try {
    if (!isInvoiceParseAiConfigured()) {
      return res.status(503).json({ error: 'Invoice parsing AI is not configured' });
    }
    const ocrText = typeof req.body?.ocrText === 'string' ? req.body.ocrText.trim() : '';
    if (!ocrText) {
      return res.status(400).json({ error: 'ocrText is required' });
    }
    if (ocrText.length > MAX_OCR_TEXT_LENGTH) {
      return res.status(400).json({
        error: `ocrText must be at most ${MAX_OCR_TEXT_LENGTH} characters`,
      });
    }
    const result = await parseInvoiceOcr(ocrText);
    res.json(result);
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === 'AI_NOT_CONFIGURED' || msg === 'DEEPSEEK_NOT_CONFIGURED' || msg === 'GEMINI_NOT_CONFIGURED') {
      return res.status(503).json({ error: 'Invoice parsing AI is not configured' });
    }
    res.status(502).json({ error: msg || 'Invoice parsing failed' });
  }
});

router.post('/bulk-create', async (req, res) => {
  try {
    const tenant = getTenantDb(req);
    const items = req.body?.products;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'products array is required' });
    }

    const schemaName = (req as typeof req & { tenant: { schemaName: string } }).tenant.schemaName;
    const db = getTenantDb(req);
    const created: Awaited<ReturnType<typeof db.createProduct>>[] = [];
    const skipped: { name: string; reason: string }[] = [];

    for (const item of items) {
      const name = typeof item.name === 'string' ? item.name.trim() : '';
      const price = Number(item.price);
      if (!name || !Number.isFinite(price)) {
        skipped.push({ name: name || '(unnamed)', reason: 'Missing name or price' });
        continue;
      }

      let barcode = typeof item.barcode === 'string' && item.barcode.trim()
        ? item.barcode.trim()
        : '';

      if (!barcode) {
        const prefix = 'BC';
        let attempts = 0;
        let exists = true;
        do {
          barcode =
            prefix +
            Date.now().toString(36).toUpperCase() +
            Math.random().toString(36).slice(2, 6).toUpperCase();
          exists = (await tenant.countProductsByBarcode(barcode)) > 0;
          attempts++;
          if (attempts > 10) {
            skipped.push({ name, reason: 'Could not generate unique barcode' });
            barcode = '';
            break;
          }
        } while (exists);
        if (!barcode) continue;
      }

      try {
        const product = await tenant.createProduct({
          barcode,
          name,
          price,
          mrp: item.mrp != null && item.mrp !== '' ? Math.max(0, Number(item.mrp)) : null,
          sellingPrice: item.sellingPrice != null && item.sellingPrice !== '' ? Math.max(0, Number(item.sellingPrice)) : null,
          unit: item.unit || 'pcs',
          description: item.description || '',
          category: item.category != null ? String(item.category).trim() : '',
          batchNo: item.batchNo != null ? String(item.batchNo).trim() : '',
          expiryDate: item.expiryDate || null,
          packSize: item.packSize != null ? Math.max(1, Number(item.packSize)) : 1,
          numBoxes: item.numBoxes != null ? Math.max(1, Number(item.numBoxes)) : 1,
          stripsPerBox: item.stripsPerBox != null ? Math.max(1, Number(item.stripsPerBox)) : 1,
          tabletsPerStrip: item.tabletsPerStrip != null ? Math.max(1, Number(item.tabletsPerStrip)) : 1,
          reorderLevel: item.reorderLevel != null ? Math.max(0, Number(item.reorderLevel)) : 0,
          costPrice:
            item.costPrice != null && item.costPrice !== '' ? Math.max(0, Number(item.costPrice)) : null,
          dealerName: item.dealerName != null ? String(item.dealerName).trim() : '',
        });

        const opening = item.openingQuantity != null ? Math.max(0, Number(item.openingQuantity)) : 0;
        if (opening > 0) {
          await applyMovement(schemaName, {
            productId: product.id,
            type: 'OPENING',
            quantity: opening,
            notes: 'Opening stock (bulk import)',
          });
          const updated = await tenant.getProduct(product.id);
          created.push(updated ?? product);
        } else {
          created.push(product);
        }
      } catch (e) {
        const msg = (e as Error).message;
        if (msg.includes('unique') || msg.includes('duplicate')) {
          skipped.push({ name, reason: 'Barcode already exists' });
        } else {
          skipped.push({ name, reason: msg });
        }
      }
    }

    res.status(201).json({ created, skipped });
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
    const { barcode, name, price, mrp, sellingPrice, unit, description, category, batchNo, expiryDate, packSize, numBoxes, stripsPerBox, tabletsPerStrip, openingQuantity, reorderLevel, costPrice, dealerName } =
      req.body;
    if (!barcode || !name || price == null) {
      return res.status(400).json({ error: 'barcode, name, and price are required' });
    }
    try {
      const product = await tenant.createProduct({
        barcode: String(barcode).trim(),
        name: String(name).trim(),
        price: Number(price),
        mrp: mrp != null && mrp !== '' ? Math.max(0, Number(mrp)) : null,
        sellingPrice: sellingPrice != null && sellingPrice !== '' ? Math.max(0, Number(sellingPrice)) : null,
        unit: unit || 'pcs',
        description: description || '',
        category: category != null ? String(category).trim() : '',
        batchNo: batchNo != null ? String(batchNo).trim() : '',
        expiryDate: expiryDate || null,
        packSize: packSize != null ? Math.max(1, Number(packSize)) : 1,
        numBoxes: numBoxes != null ? Math.max(1, Number(numBoxes)) : 1,
        stripsPerBox: stripsPerBox != null ? Math.max(1, Number(stripsPerBox)) : 1,
        tabletsPerStrip: tabletsPerStrip != null ? Math.max(1, Number(tabletsPerStrip)) : 1,
        reorderLevel: reorderLevel != null ? Math.max(0, Number(reorderLevel)) : 0,
        costPrice:
          costPrice != null && costPrice !== '' ? Math.max(0, Number(costPrice)) : null,
        dealerName: dealerName != null ? String(dealerName).trim() : '',
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
    const { barcode, name, price, mrp, sellingPrice, unit, description, category, batchNo, expiryDate, packSize, numBoxes, stripsPerBox, tabletsPerStrip, reorderLevel, costPrice, dealerName } = req.body;
    try {
      const product = await getTenantDb(req).updateProduct(req.params.id, {
        ...(barcode !== undefined && { barcode: String(barcode).trim() }),
        ...(name !== undefined && { name: String(name).trim() }),
        ...(price !== undefined && { price: Number(price) }),
        ...(mrp !== undefined && { mrp: mrp === '' || mrp == null ? null : Math.max(0, Number(mrp)) }),
        ...(sellingPrice !== undefined && { sellingPrice: sellingPrice === '' || sellingPrice == null ? null : Math.max(0, Number(sellingPrice)) }),
        ...(unit !== undefined && { unit }),
        ...(description !== undefined && { description }),
        ...(category !== undefined && { category: String(category).trim() }),
        ...(batchNo !== undefined && { batchNo: String(batchNo).trim() }),
        ...(expiryDate !== undefined && { expiryDate: expiryDate || null }),
        ...(packSize !== undefined && { packSize: Math.max(1, Number(packSize)) }),
        ...(numBoxes !== undefined && { numBoxes: Math.max(1, Number(numBoxes)) }),
        ...(stripsPerBox !== undefined && { stripsPerBox: Math.max(1, Number(stripsPerBox)) }),
        ...(tabletsPerStrip !== undefined && { tabletsPerStrip: Math.max(1, Number(tabletsPerStrip)) }),
        ...(reorderLevel !== undefined && { reorderLevel: Math.max(0, Number(reorderLevel)) }),
        ...(costPrice !== undefined && {
          costPrice:
            costPrice === '' || costPrice == null ? null : Math.max(0, Number(costPrice)),
        }),
        ...(dealerName !== undefined && { dealerName: String(dealerName).trim() }),
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
