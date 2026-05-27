import { Router } from 'express';
import { generateInvoicePdf } from '../services/invoicePdf.js';
import { sendInvoiceWhatsApp, type SendInvoiceWhatsAppResult } from '../services/whatsapp.js';
import { getBusinessSettings } from '../services/businessSettings.js';
import { authMiddleware, AuthPayload, tenantMiddleware } from '../middleware/auth.js';
import { getTenant, getTenantDb } from '../middleware/tenant.js';
import {
  deductForSale,
  linkSaleMovementsToInvoice,
  restoreSaleDeduction,
  InsufficientStockError,
} from '../services/stock.js';

const router = Router();

router.use(authMiddleware, tenantMiddleware);

function getNextInvoiceNumber(): string {
  return 'INV-' + Date.now();
}

router.get('/', async (req, res) => {
  try {
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;
    const customerId = req.query.customerId as string | undefined;
    const page = Number(req.query.page ?? '1');
    const limit = Number(req.query.limit ?? '10');
    const pageNumber = Number.isFinite(page) && page > 0 ? page : 1;
    const pageSize = Number.isFinite(limit) && limit > 0 && limit <= 200 ? limit : 10;

    let toDate: Date | undefined;
    if (to) {
      toDate = new Date(to);
      toDate.setHours(23, 59, 59, 999);
    }

    const result = await getTenantDb(req).listInvoices({
      from: from ? new Date(from) : undefined,
      to: toDate,
      customerId,
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

router.get('/stock-in', async (req, res) => {
  try {
    const page = Number(req.query.page ?? '1');
    const limit = Number(req.query.limit ?? '20');
    const pageNumber = Number.isFinite(page) && page > 0 ? page : 1;
    const pageSize = Number.isFinite(limit) && limit > 0 && limit <= 200 ? limit : 20;

    const result = await getTenantDb(req).listStockInInvoices({
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

router.get('/stock-in/:id', async (req, res) => {
  try {
    const db = getTenantDb(req);
    const invoice = await db.getStockInInvoice(req.params.id);
    if (!invoice) return res.status(404).json({ error: 'Stock-in invoice not found' });
    const movements = await db.listMovementsByStockInInvoice(req.params.id);
    res.json({ ...invoice, movements });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const invoice = await getTenantDb(req).getInvoice(req.params.id);
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
      items: {
        productId: string;
        productName: string;
        barcode: string;
        quantity: number;
        unitPrice: number;
        amount: number;
      }[];
      tax?: number;
      notes?: string;
      sendWhatsApp?: boolean;
    };
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items array is required' });
    }

    const { businessId, schemaName } = getTenant(req);
    const db = getTenantDb(req);
    const subtotal = items.reduce((sum, i) => sum + Number(i.amount), 0);
    const total = subtotal + Number(tax);
    const authUser = (req as typeof req & { user?: AuthPayload }).user;
    const invoiceNumber = getNextInvoiceNumber();

    let applied: { productId: string; quantity: number }[] = [];
    try {
      const saleResult = await deductForSale(
        schemaName,
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

    const productCosts = new Map<string, number | null>();
    for (const item of items) {
      if (!productCosts.has(item.productId)) {
        const product = await db.getProduct(item.productId);
        productCosts.set(item.productId, product?.costPrice ?? null);
      }
    }

    let invoice: Awaited<ReturnType<typeof db.createInvoice>>;
    try {
      invoice = await db.createInvoice({
        customerId: customerId || null,
        invoiceNumber,
        date: new Date(),
        createdByEmail: authUser?.email || '',
        createdByName: authUser?.name || '',
        subtotal,
        tax: Number(tax),
        total,
        notes: String(notes),
        items: items.map((i) => ({
          productId: i.productId,
          productName: i.productName,
          barcode: i.barcode,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          unitCost: productCosts.get(i.productId) ?? null,
          amount: i.amount,
        })),
      });
    } catch (createErr) {
      await restoreSaleDeduction(schemaName, applied);
      throw createErr;
    }

    await linkSaleMovementsToInvoice(schemaName, invoice.id, invoiceNumber);

    const populated = invoice;
    if (populated) {
      try {
        await generateInvoicePdf(businessId, schemaName, {
          id: populated.id,
          invoiceNumber: populated.invoiceNumber,
          date: populated.date,
          subtotal: populated.subtotal,
          tax: populated.tax,
          total: populated.total,
          notes: populated.notes,
          createdByName: populated.createdByName,
          customer: populated.customer,
          items: (populated.items ?? []).map((i) => ({
            productName: i.productName,
            barcode: i.barcode,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            amount: i.amount,
          })),
        });
      } catch (pdfError) {
        console.error('Failed to generate invoice PDF', pdfError);
      }
      let whatsappSend: SendInvoiceWhatsAppResult | undefined;
      if (sendWhatsApp) {
        try {
          const settings = await getBusinessSettings(schemaName);
          whatsappSend = await sendInvoiceWhatsApp(
            businessId,
            populated as Parameters<typeof sendInvoiceWhatsApp>[1],
            { storeName: settings.businessName, shopContact: settings.phone }
          );
          if (whatsappSend.ok) {
            await db.updateInvoiceWhatsApp(populated.id, {
              messageId: whatsappSend.messageId,
              status: 'sent',
            });
            populated.whatsappMessageId = whatsappSend.messageId;
            populated.whatsappStatus = 'sent';
          }
        } catch (waError) {
          console.error('Failed to send invoice via WhatsApp', waError);
          whatsappSend = { ok: false, reason: 'unexpected_error' };
        }
      }
      return res.status(201).json(
        whatsappSend !== undefined ? { ...populated, whatsappSend } : populated
      );
    }
    res.status(201).json(populated);
  } catch (e) {
    if (e instanceof InsufficientStockError) {
      return res.status(400).json({ error: e.message });
    }
    res.status(500).json({ error: (e as Error).message });
  }
});

router.post('/:id/resend-whatsapp', async (req, res) => {
  try {
    const { businessId, schemaName } = getTenant(req);
    const db = getTenantDb(req);
    const invoice = await db.getInvoice(req.params.id);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

    const settings = await getBusinessSettings(schemaName);
    const result = await sendInvoiceWhatsApp(
      businessId,
      invoice as Parameters<typeof sendInvoiceWhatsApp>[1],
      { storeName: settings.businessName, shopContact: settings.phone }
    );
    if (result.ok) {
      await db.updateInvoiceWhatsApp(invoice.id, {
        messageId: result.messageId,
        status: 'sent',
      });
    }
    res.json({ whatsappSend: result });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

export default router;
