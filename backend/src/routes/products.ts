import { Router } from 'express';
import multer from 'multer';
import { generateBarcodeImage } from '../services/barcode.js';
import {
  extractProductNameFromLabelText,
  isProductNameAiConfigured,
} from '../services/productNameAi.js';
import {
  isInvoiceImageParseSupported,
  isInvoiceParseAiConfigured,
  type ParsedInvoiceHeader,
  parseInvoiceImage,
  parseInvoiceOcr,
} from '../services/invoiceParseAi.js';
import { applyMovement } from '../services/stock.js';
import {
  previewMatch,
  previewMatches,
  validateStockInMatch,
} from '../services/productMatch.js';
import { authMiddleware, tenantMiddleware, type AuthPayload } from '../middleware/auth.js';
import { getTenant, getTenantDb } from '../middleware/tenant.js';

const MAX_OCR_TEXT_LENGTH = 8000;
const MAX_INVOICE_IMAGE_BYTES = 10 * 1024 * 1024;

function openingMovementExtras(item: {
  costPrice?: number | string | null;
  dealerName?: string | null;
  batchNo?: string | null;
  expiryDate?: string | null;
  mrp?: number | string | null;
  sellingPrice?: number | string | null;
  numBoxes?: number | null;
  stripsPerBox?: number | null;
  tabletsPerStrip?: number | null;
}) {
  return {
    costPrice:
      item.costPrice != null && item.costPrice !== ''
        ? Math.max(0, Number(item.costPrice))
        : undefined,
    dealerName: item.dealerName != null ? String(item.dealerName).trim() : '',
    batchNo: item.batchNo != null ? String(item.batchNo).trim() : '',
    expiryDate: item.expiryDate || null,
    mrp:
      item.mrp != null && item.mrp !== '' ? Math.max(0, Number(item.mrp)) : undefined,
    sellingPrice:
      item.sellingPrice != null && item.sellingPrice !== ''
        ? Math.max(0, Number(item.sellingPrice))
        : undefined,
    numBoxes: item.numBoxes != null ? Math.max(1, Number(item.numBoxes)) : undefined,
    stripsPerBox:
      item.stripsPerBox != null ? Math.max(1, Number(item.stripsPerBox)) : undefined,
    tabletsPerStrip:
      item.tabletsPerStrip != null ? Math.max(1, Number(item.tabletsPerStrip)) : undefined,
  };
}

const invoiceImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_INVOICE_IMAGE_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    const mime = (file.mimetype || '').toLowerCase();
    if (
      mime.startsWith('image/') ||
      mime === 'application/octet-stream'
    ) {
      cb(null, true);
      return;
    }
    cb(new Error('Only image files are allowed'));
  },
});

const router = Router();

router.use(authMiddleware, tenantMiddleware);

function getUser(req: { user?: AuthPayload }): AuthPayload | undefined {
  return req.user;
}

async function generateUniqueBarcode(tenant: ReturnType<typeof getTenantDb>): Promise<string | null> {
  const prefix = 'BC';
  for (let attempts = 0; attempts < 10; attempts++) {
    const barcode =
      prefix +
      Date.now().toString(36).toUpperCase() +
      Math.random().toString(36).slice(2, 6).toUpperCase();
    const exists = (await tenant.countProductsByBarcode(barcode)) > 0;
    if (!exists) return barcode;
  }
  return null;
}

type ImportItemBody = {
  action?: 'stock_in' | 'create';
  productId?: string;
  name?: string;
  price?: number;
  mrp?: number | string;
  sellingPrice?: number | string;
  unit?: string;
  description?: string;
  category?: string;
  batchNo?: string;
  expiryDate?: string | null;
  packSize?: number;
  numBoxes?: number;
  stripsPerBox?: number;
  tabletsPerStrip?: number;
  openingQuantity?: number;
  reorderLevel?: number;
  costPrice?: number | string;
  dealerName?: string;
  notes?: string;
};

type BulkInvoiceHeaderBody = ParsedInvoiceHeader;

function normalizeHeaderMergeKey(header?: BulkInvoiceHeaderBody): {
  invoiceNumber: string;
  supplierGst: string;
} {
  return {
    invoiceNumber: String(header?.invoiceNumber ?? '').trim().toUpperCase(),
    supplierGst: String(header?.supplierGst ?? header?.supplierGstNumber ?? '')
      .trim()
      .toUpperCase(),
  };
}

function mergeNonEmptyHeader(
  current: Record<string, unknown>,
  incoming?: BulkInvoiceHeaderBody
): Record<string, unknown> {
  if (!incoming) return current;
  const setText = (v?: string): string | undefined => {
    const s = String(v ?? '').trim();
    return s ? s : undefined;
  };
  return {
    ...current,
    ...(setText(incoming.supplierName) && { supplierName: setText(incoming.supplierName)! }),
    ...(setText(incoming.supplierGstNumber) && {
      supplierGstNumber: setText(incoming.supplierGstNumber)!,
    }),
    ...(setText(incoming.supplierDrugLicenseNumber) && {
      supplierDrugLicenseNumber: setText(incoming.supplierDrugLicenseNumber)!,
    }),
    ...(setText(incoming.supplierAddress) && { supplierAddress: setText(incoming.supplierAddress)! }),
    ...(setText(incoming.supplierMobile) && { supplierMobile: setText(incoming.supplierMobile)! }),
    ...(setText(incoming.supplierEmail) && { supplierEmail: setText(incoming.supplierEmail)! }),
    ...(setText(incoming.supplierStateCode) && {
      supplierStateCode: setText(incoming.supplierStateCode)!,
    }),
    ...(setText(incoming.supplierPanNumber) && { supplierPanNumber: setText(incoming.supplierPanNumber)! }),
    ...(setText(incoming.supplierCode) && { supplierCode: setText(incoming.supplierCode)! }),
    ...(setText(incoming.invoiceNumber) && { invoiceNumber: setText(incoming.invoiceNumber)! }),
    ...(setText(incoming.invoiceDate) && { invoiceDate: setText(incoming.invoiceDate)! }),
    ...(setText(incoming.dueDate) && { dueDate: setText(incoming.dueDate)! }),
    ...(incoming.invoiceTotal != null && Number.isFinite(Number(incoming.invoiceTotal))
      ? { invoiceTotal: Number(incoming.invoiceTotal) }
      : {}),
    ...(incoming.gstTotal != null && Number.isFinite(Number(incoming.gstTotal))
      ? { gstTotal: Number(incoming.gstTotal) }
      : {}),
    ...(incoming.discount != null && Number.isFinite(Number(incoming.discount))
      ? { discount: Number(incoming.discount) }
      : {}),
    ...(incoming.roundOff != null && Number.isFinite(Number(incoming.roundOff))
      ? { roundOff: Number(incoming.roundOff) }
      : {}),
    ...(setText(incoming.paymentType) && { paymentType: setText(incoming.paymentType)! }),
    ...(setText(incoming.supplierGst) && { supplierGst: setText(incoming.supplierGst)! }),
    ...(setText(incoming.placeOfSupply) && { placeOfSupply: setText(incoming.placeOfSupply)! }),
  };
}

async function syncProductFieldsFromImport(
  tenant: ReturnType<typeof getTenantDb>,
  productId: string,
  item: ImportItemBody
) {
  const updates: Parameters<typeof tenant.updateProduct>[1] = {};
  if (item.batchNo != null && String(item.batchNo).trim()) {
    updates.batchNo = String(item.batchNo).trim();
  }
  if (item.expiryDate) updates.expiryDate = item.expiryDate;
  if (item.mrp != null && item.mrp !== '') updates.mrp = Math.max(0, Number(item.mrp));
  if (item.sellingPrice != null && item.sellingPrice !== '') {
    updates.sellingPrice = Math.max(0, Number(item.sellingPrice));
  }
  if (item.price != null && Number.isFinite(Number(item.price))) {
    updates.price = Math.max(0, Number(item.price));
  }
  if (item.costPrice != null && item.costPrice !== '') {
    updates.costPrice = Math.max(0, Number(item.costPrice));
  }
  if (item.dealerName != null && String(item.dealerName).trim()) {
    updates.dealerName = String(item.dealerName).trim();
  }
  if (Object.keys(updates).length > 0) {
    await tenant.updateProduct(productId, updates);
  }
}

router.get('/', async (req, res) => {
  try {
    const q = (req.query.q as string) || '';
    const products = await getTenantDb(req).listProducts(q);
    res.json(products);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.get('/paged', async (req, res) => {
  try {
    const q = (req.query.q as string) || '';
    const page = Number(req.query.page ?? '1');
    const limit = Number(req.query.limit ?? '20');
    const pageNumber = Number.isFinite(page) && page > 0 ? page : 1;
    const pageSize = Number.isFinite(limit) && limit > 0 && limit <= 200 ? limit : 20;
    const result = await getTenantDb(req).listProductsPaged({
      q,
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

router.post('/parse-invoice-image', (req, res, next) => {
  invoiceImageUpload.single('image')(req, res, (err) => {
    if (err) {
      console.error('[parse-invoice-image] upload error', err);
      const msg =
        err instanceof Error && 'code' in err && err.code === 'LIMIT_FILE_SIZE'
          ? 'Image is too large (max 10MB)'
          : err instanceof Error
            ? err.message
            : 'Upload failed';
      return res.status(400).json({ error: msg });
    }
    next();
  });
}, async (req, res) => {
  const started = Date.now();
  const user = (req as typeof req & { user?: { email?: string } }).user;
  console.log('[parse-invoice-image] request', {
    user: user?.email ?? 'unknown',
    contentType: req.headers['content-type'],
  });

  try {
    if (!isInvoiceImageParseSupported()) {
      console.warn('[parse-invoice-image] not configured (needs google+GEMINI_API_KEY or deepseek+DEEPSEEK_API_KEY)');
      return res.status(503).json({
        error: 'Invoice image parsing is not configured for the active AI provider',
      });
    }

    const file = req.file;
    if (!file?.buffer?.length) {
      console.warn('[parse-invoice-image] no file in multipart body');
      return res.status(400).json({ error: 'image file is required' });
    }

    const mimeType =
      file.mimetype && file.mimetype !== 'application/octet-stream'
        ? file.mimetype
        : 'image/jpeg';

    console.log('[parse-invoice-image] file received', {
      originalName: file.originalname,
      mimeType,
      sizeBytes: file.size,
    });

    const result = await parseInvoiceImage(mimeType, file.buffer);

    console.log('[parse-invoice-image] success', {
      ms: Date.now() - started,
      dealerName: result.dealerName,
      productCount: result.products.length,
    });
    res.json(result);
  } catch (e) {
    const msg = (e as Error).message;
    console.error('[parse-invoice-image] failed', {
      ms: Date.now() - started,
      error: msg,
      stack: e instanceof Error ? e.stack : undefined,
    });

    if (msg === 'IMAGE_PARSE_NOT_SUPPORTED_FOR_PROVIDER') {
      return res.status(503).json({
        error: 'Invoice image parsing is not configured for the active AI provider',
      });
    }
    if (msg === 'AI_NOT_CONFIGURED' || msg === 'GEMINI_NOT_CONFIGURED') {
      return res.status(503).json({ error: 'Invoice parsing AI is not configured' });
    }
    if (msg.includes('Unsupported image type')) {
      return res.status(400).json({ error: msg });
    }
    res.status(502).json({ error: msg || 'Invoice image parsing failed' });
  }
});

router.post('/match-preview', async (req, res) => {
  try {
    const raw = req.body?.items;
    if (!Array.isArray(raw) || raw.length === 0) {
      return res.status(400).json({ error: 'items array is required' });
    }
    const names = raw.map((item) =>
      typeof item?.name === 'string' ? item.name.trim() : ''
    );
    const catalog = await getTenantDb(req).listProductsForMatch();
    const items = previewMatches(names, catalog);
    res.json({ items });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.post('/match-preview-one', async (req, res) => {
  try {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    if (!name) return res.status(400).json({ error: 'name is required' });
    const catalog = await getTenantDb(req).listProductsForMatch();
    res.json(previewMatch(name, catalog));
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.post('/bulk-import', async (req, res) => {
  try {
    const tenant = getTenantDb(req);
    const raw = req.body?.products;
    const invoiceHeader = req.body?.invoiceHeader as BulkInvoiceHeaderBody | undefined;
    if (!Array.isArray(raw) || raw.length === 0) {
      return res.status(400).json({ error: 'products array is required' });
    }

    const schemaName = getTenant(req).schemaName;
    const catalog = await tenant.listProductsForMatch();
    const user = getUser(req as { user?: AuthPayload });
    const mergeKey = normalizeHeaderMergeKey(invoiceHeader);
    let stockInInvoiceId: string | null = null;
    if (mergeKey.invoiceNumber && mergeKey.supplierGst) {
      const existing = await tenant.findStockInInvoiceByNumberAndSupplierGst(
        mergeKey.invoiceNumber,
        mergeKey.supplierGst
      );
      if (existing) {
        stockInInvoiceId = existing.id;
        await tenant.mergeStockInInvoice(
          existing.id,
          mergeNonEmptyHeader({}, {
            ...invoiceHeader,
            invoiceNumber: mergeKey.invoiceNumber,
            supplierGst: mergeKey.supplierGst,
          })
        );
      }
    }
    if (!stockInInvoiceId && invoiceHeader) {
      const createdHeader = await tenant.createStockInInvoice(
        mergeNonEmptyHeader(
          {
            createdByEmail: user?.email ?? '',
            createdByName: user?.name ?? '',
          },
          {
            ...invoiceHeader,
            invoiceNumber: mergeKey.invoiceNumber || invoiceHeader.invoiceNumber,
            supplierGst: mergeKey.supplierGst || invoiceHeader.supplierGst,
          }
        )
      );
      stockInInvoiceId = createdHeader.id;
    }

    const stockedIn: {
      product: Awaited<ReturnType<typeof tenant.getProduct>>;
      movement: { id: string };
      invoiceName: string;
    }[] = [];
    const created: NonNullable<Awaited<ReturnType<typeof tenant.getProduct>>>[] = [];
    const skipped: { name: string; reason: string }[] = [];

    for (const item of raw as ImportItemBody[]) {
      const name = typeof item.name === 'string' ? item.name.trim() : '';
      const price = Number(item.price);
      const action = item.action === 'stock_in' ? 'stock_in' : 'create';
      const qty = item.openingQuantity != null ? Math.max(0, Number(item.openingQuantity)) : 0;

      if (!name || !Number.isFinite(price)) {
        skipped.push({ name: name || '(unnamed)', reason: 'Missing name or price' });
        continue;
      }

      if (action === 'stock_in') {
        const productId = typeof item.productId === 'string' ? item.productId.trim() : '';
        if (!productId) {
          skipped.push({ name, reason: 'Missing product for stock in' });
          continue;
        }
        const validation = validateStockInMatch(name, productId, catalog);
        if (!validation.ok) {
          skipped.push({ name, reason: validation.reason ?? 'Match validation failed' });
          continue;
        }
        if (qty <= 0) {
          skipped.push({ name, reason: 'Quantity must be positive for stock in' });
          continue;
        }
        try {
          const result = await applyMovement(schemaName, {
            productId,
            type: 'STOCK_IN',
            quantity: qty,
            notes: item.notes?.trim() || 'Stock in (bulk import)',
            stockInInvoiceId,
            user,
            ...openingMovementExtras(item),
          });
          await syncProductFieldsFromImport(tenant, productId, item);
          const updated = await tenant.getProduct(productId);
          stockedIn.push({
            product: updated ?? result.product,
            movement: { id: result.movement.id },
            invoiceName: name,
          });
        } catch (e) {
          skipped.push({ name, reason: (e as Error).message });
        }
        continue;
      }

      let barcode = await generateUniqueBarcode(tenant);
      if (!barcode) {
        skipped.push({ name, reason: 'Could not generate unique barcode' });
        continue;
      }

      try {
        const product = await tenant.createProduct({
          barcode,
          name,
          price,
          mrp: item.mrp != null && item.mrp !== '' ? Math.max(0, Number(item.mrp)) : null,
          sellingPrice:
            item.sellingPrice != null && item.sellingPrice !== ''
              ? Math.max(0, Number(item.sellingPrice))
              : null,
          unit: item.unit || 'pcs',
          description: item.description || '',
          category: item.category != null ? String(item.category).trim() : '',
          batchNo: item.batchNo != null ? String(item.batchNo).trim() : '',
          expiryDate: item.expiryDate || null,
          packSize: item.packSize != null ? Math.max(1, Number(item.packSize)) : 1,
          numBoxes: item.numBoxes != null ? Math.max(1, Number(item.numBoxes)) : 1,
          stripsPerBox: item.stripsPerBox != null ? Math.max(1, Number(item.stripsPerBox)) : 1,
          tabletsPerStrip:
            item.tabletsPerStrip != null ? Math.max(1, Number(item.tabletsPerStrip)) : 1,
          reorderLevel: item.reorderLevel != null ? Math.max(0, Number(item.reorderLevel)) : 0,
          costPrice:
            item.costPrice != null && item.costPrice !== ''
              ? Math.max(0, Number(item.costPrice))
              : null,
          dealerName: item.dealerName != null ? String(item.dealerName).trim() : '',
        });

        if (qty > 0) {
          await applyMovement(schemaName, {
            productId: product.id,
            type: 'OPENING',
            quantity: qty,
            notes: 'Opening stock (bulk import)',
            stockInInvoiceId,
            user,
            ...openingMovementExtras(item),
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

    const stockInInvoice = stockInInvoiceId
      ? await tenant.getStockInInvoice(stockInInvoiceId)
      : null;
    res.status(201).json({ stockedIn, created, skipped, stockInInvoice });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
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
            ...openingMovementExtras(item),
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
          ...openingMovementExtras({
            costPrice,
            dealerName,
            batchNo,
            expiryDate,
            mrp,
            sellingPrice,
            numBoxes,
            stripsPerBox,
            tabletsPerStrip,
          }),
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
