import { Router } from 'express';
import { Invoice } from '../models/Invoice.js';
import { generateInvoicePdf } from '../services/invoicePdf.js';
import { sendInvoiceWhatsApp } from '../services/whatsapp.js';
import { authMiddleware, AuthPayload } from '../middleware/auth.js';
import {
  deductForSale,
  linkSaleMovementsToInvoice,
  restoreSaleDeduction,
  InsufficientStockError,
} from '../services/stock.js';

const router = Router();

router.use(authMiddleware);

function getNextInvoiceNumber(): string {
  return 'INV-' + Date.now();
}

router.get('/', async (req, res) => {
  try {
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;
    const page = Number(req.query.page ?? '1');
    const limit = Number(req.query.limit ?? '10');
    const pageNumber = Number.isFinite(page) && page > 0 ? page : 1;
    const pageSize = Number.isFinite(limit) && limit > 0 && limit <= 200 ? limit : 10;

    const filter: Record<string, unknown> = {};
    if (from) filter.date = { ...((filter.date as object) || {}), $gte: new Date(from) };
    if (to) filter.date = { ...((filter.date as object) || {}), $lte: new Date(to) };

    const [invoices, total] = await Promise.all([
      Invoice.find(filter)
        .populate('customerId', 'name phone email address')
        .sort({ date: -1 })
        .skip((pageNumber - 1) * pageSize)
        .limit(pageSize)
        .lean(),
      Invoice.countDocuments(filter),
    ]);

    res.json({
      items: invoices,
      total,
      page: pageNumber,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id)
      .populate('customerId', 'name phone email address')
      .lean();
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    res.json(invoice);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { customerId, items, tax = 0, notes = '', sendWhatsApp = false } = req.body as {
      customerId?: string;
      items: { productId: string; productName: string; barcode: string; quantity: number; unitPrice: number; amount: number }[];
      tax?: number;
      notes?: string;
      sendWhatsApp?: boolean;
    };
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items array is required' });
    }
    const subtotal = items.reduce((sum: number, i: { amount: number }) => sum + Number(i.amount), 0);
    const total = subtotal + Number(tax);
    const authUser = (req as typeof req & { user?: AuthPayload }).user;
    const invoiceNumber = getNextInvoiceNumber();

    let applied: { productId: string; quantity: number }[] = [];
    try {
      const saleResult = await deductForSale(
        items.map((i) => ({
          productId: i.productId,
          productName: i.productName,
          quantity: Number(i.quantity),
        })),
        { referenceType: 'invoice', referenceId: null, referenceLabel: invoiceNumber },
        authUser
      );
      applied = saleResult.applied;
    } catch (stockErr) {
      if (stockErr instanceof InsufficientStockError) {
        return res.status(400).json({ error: stockErr.message });
      }
      throw stockErr;
    }

    let invoice;
    try {
      invoice = await Invoice.create({
      customerId: customerId || null,
      invoiceNumber,
      date: new Date(),
      createdByEmail: authUser?.email || '',
      createdByName: authUser?.name || '',
      subtotal,
      tax: Number(tax),
      total,
      notes: String(notes),
      items: items.map((i: { productId: string; productName: string; barcode: string; quantity: number; unitPrice: number; amount: number }) => ({
        productId: i.productId,
        productName: i.productName,
        barcode: i.barcode,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        amount: i.amount,
      })),
    });
    } catch (createErr) {
      await restoreSaleDeduction(applied);
      throw createErr;
    }

    await linkSaleMovementsToInvoice(invoice._id, invoiceNumber);

    const populated = await Invoice.findById(invoice._id)
      .populate('customerId', 'name phone email address')
      .lean();
    if (populated) {
      try {
        await generateInvoicePdf(populated as any);
      } catch (pdfError) {
        console.error('Failed to generate invoice PDF', pdfError);
      }
      if (sendWhatsApp) {
        try {
          await sendInvoiceWhatsApp(populated as any);
        } catch (waError) {
          console.error('Failed to send invoice via WhatsApp', waError);
        }
      }
    }
    res.status(201).json(populated);
  } catch (e) {
    if (e instanceof InsufficientStockError) {
      return res.status(400).json({ error: e.message });
    }
    res.status(500).json({ error: (e as Error).message });
  }
});

export default router;
