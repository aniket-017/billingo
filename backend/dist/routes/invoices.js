import { Router } from 'express';
import { generateInvoicePdf } from '../services/invoicePdf.js';
import { sendInvoiceWhatsApp } from '../services/whatsapp.js';
import { authMiddleware, tenantMiddleware } from '../middleware/auth.js';
import { getTenant, getTenantDb } from '../middleware/tenant.js';
import { deductForSale, linkSaleMovementsToInvoice, restoreSaleDeduction, InsufficientStockError, } from '../services/stock.js';
const router = Router();
router.use(authMiddleware, tenantMiddleware);
function getNextInvoiceNumber() {
    return 'INV-' + Date.now();
}
router.get('/', async (req, res) => {
    try {
        const from = req.query.from;
        const to = req.query.to;
        const page = Number(req.query.page ?? '1');
        const limit = Number(req.query.limit ?? '10');
        const pageNumber = Number.isFinite(page) && page > 0 ? page : 1;
        const pageSize = Number.isFinite(limit) && limit > 0 && limit <= 200 ? limit : 10;
        const result = await getTenantDb(req).listInvoices({
            from: from ? new Date(from) : undefined,
            to: to ? new Date(to) : undefined,
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
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
router.get('/:id', async (req, res) => {
    try {
        const invoice = await getTenantDb(req).getInvoice(req.params.id);
        if (!invoice)
            return res.status(404).json({ error: 'Invoice not found' });
        res.json(invoice);
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
router.post('/', async (req, res) => {
    try {
        const { customerId, items, tax = 0, notes = '', sendWhatsApp = false } = req.body;
        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: 'items array is required' });
        }
        const schemaName = getTenant(req).schemaName;
        const db = getTenantDb(req);
        const subtotal = items.reduce((sum, i) => sum + Number(i.amount), 0);
        const total = subtotal + Number(tax);
        const authUser = req.user;
        const invoiceNumber = getNextInvoiceNumber();
        let applied = [];
        try {
            const saleResult = await deductForSale(schemaName, items.map((i) => ({
                productId: i.productId,
                productName: i.productName,
                quantity: Number(i.quantity),
            })), { referenceType: 'invoice', referenceId: null, referenceLabel: invoiceNumber }, authUser);
            applied = saleResult.applied;
        }
        catch (stockErr) {
            if (stockErr instanceof InsufficientStockError) {
                return res.status(400).json({ error: stockErr.message });
            }
            throw stockErr;
        }
        let invoice;
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
                    amount: i.amount,
                })),
            });
        }
        catch (createErr) {
            await restoreSaleDeduction(schemaName, applied);
            throw createErr;
        }
        await linkSaleMovementsToInvoice(schemaName, invoice.id, invoiceNumber);
        const populated = await db.getInvoice(invoice.id);
        if (populated) {
            try {
                await generateInvoicePdf(schemaName, {
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
            }
            catch (pdfError) {
                console.error('Failed to generate invoice PDF', pdfError);
            }
            if (sendWhatsApp) {
                try {
                    await sendInvoiceWhatsApp(populated);
                }
                catch (waError) {
                    console.error('Failed to send invoice via WhatsApp', waError);
                }
            }
        }
        res.status(201).json(populated);
    }
    catch (e) {
        if (e instanceof InsufficientStockError) {
            return res.status(400).json({ error: e.message });
        }
        res.status(500).json({ error: e.message });
    }
});
export default router;
