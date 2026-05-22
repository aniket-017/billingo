import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getBusinessSettings } from './businessSettings.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Point projectRoot at the backend folder so PDFs are written to backend/invoices,
// which is what the Express server exposes publicly.
const projectRoot = path.join(__dirname, '..', '..');

type InvoiceItem = {
  productName: string;
  barcode: string;
  quantity: number;
  unitPrice: number;
  amount: number;
};

type InvoiceForPdf = {
  id: string;
  invoiceNumber: string;
  date: Date | string;
  subtotal: number;
  tax: number;
  total: number;
  notes?: string;
  createdByName?: string;
  customer?: {
    name?: string;
    phone?: string;
    email?: string;
    address?: string;
  } | null;
  items: InvoiceItem[];
};

export async function generateInvoicePdf(
  schemaName: string,
  invoice: InvoiceForPdf
): Promise<string> {
  const settings = await getBusinessSettings(schemaName);
  const invoicesDir = path.join(projectRoot, 'invoices');
  await fs.promises.mkdir(invoicesDir, { recursive: true });

  const safeNumber = invoice.invoiceNumber.replace(/[^A-Za-z0-9_-]/g, '_');
  const filename = `${safeNumber}.pdf`;
  const filePath = path.join(invoicesDir, filename);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40 });
    const stream = fs.createWriteStream(filePath);

    doc.pipe(stream);

    // Layout similar to existing print design
    const pageWidth = doc.page.width;
    const margin = 40;
    let y = margin;

    // Store header
    if (settings.businessName) {
      doc.fontSize(18).text(settings.businessName, margin, y, { align: 'left' });
      y += 22;
    }
    doc.fontSize(9);
    if (settings.address) {
      settings.address.split('\n').forEach((line) => {
        doc.text(line.trim(), margin, y);
        y += 12;
      });
    }
    const contactLines: string[] = [];
    if (settings.phone) contactLines.push(settings.phone);
    if (settings.email) contactLines.push(settings.email);
    if (settings.taxId) contactLines.push(`Tax ID: ${settings.taxId}`);
    if (contactLines.length) {
      doc.fontSize(10).text('Contact', pageWidth - margin - 120, margin, { align: 'right', width: 120 });
      doc.fontSize(9);
      let contactY = margin + 14;
      contactLines.forEach((line) => {
        doc.text(line, pageWidth - margin - 120, contactY, { align: 'right', width: 120 });
        contactY += 12;
      });
    }

    // Separator line
    y += 24;
    doc.moveTo(margin, y).lineTo(pageWidth - margin, y).stroke();
    y += 16;

    // Invoice title + meta
    doc.fontSize(14).text(`Invoice ${invoice.invoiceNumber}`, margin, y);
    y += 20;
    doc.fontSize(10);
    doc.text(`Date & time: ${new Date(invoice.date).toLocaleString()}`, margin, y);
    y += 14;
    if (invoice.createdByName) {
      doc.text(`Created by: ${invoice.createdByName}`, margin, y);
      y += 18;
    } else {
      y += 4;
    }

    // Customer section
    if (invoice.customer) {
      doc.fontSize(10).text('Billed to:', margin, y);
      y += 14;
      if (invoice.customer.name) {
        doc.fontSize(11).text(invoice.customer.name, margin, y);
        y += 14;
      }
      if (invoice.customer.phone) {
        doc.fontSize(10).text(invoice.customer.phone, margin, y);
        y += 12;
      }
      const addrParts: string[] = [];
      if (invoice.customer.address) addrParts.push(invoice.customer.address);
      if (invoice.customer.email) addrParts.push(invoice.customer.email);
      if (addrParts.length) {
        doc.text(addrParts.join(' · '), margin, y);
        y += 16;
      }
    }

    y += 8;

    // Items table header with clearer typography
    const colItem = margin;
    const colQty = margin + 230;
    const colPrice = margin + 300;
    const colAmount = margin + 390;

    const headerHeight = 18;
    const rowHeight = 20;

    doc.fontSize(10);
    doc.text('Item', colItem, y, { width: 220 });
    doc.text('Qty', colQty, y, { width: 40, align: 'right' });
    doc.text('Price (INR)', colPrice, y, { width: 70, align: 'right' });
    doc.text('Amount (INR)', colAmount, y, { width: 80, align: 'right' });

    // Header underline
    y += headerHeight;
    doc.moveTo(margin, y).lineTo(pageWidth - margin, y).stroke();

    // Items rows with even spacing and row lines
    invoice.items.forEach((item) => {
      y += 6;
      doc.fontSize(10).text(item.productName, colItem, y, { width: 220 });
      doc.text(String(item.quantity), colQty, y, { width: 40, align: 'right' });
      doc.text(item.unitPrice.toFixed(2), colPrice, y, { width: 70, align: 'right' });
      doc.text(item.amount.toFixed(2), colAmount, y, { width: 80, align: 'right' });
      y += rowHeight - 6;
      doc.moveTo(margin, y).lineTo(pageWidth - margin, y).stroke();
    });

    // Totals line
    y += 8;
    const totalsText = `Subtotal: ${invoice.subtotal.toFixed(2)} INR | Total: ${invoice.total.toFixed(2)} INR`;
    doc.fontSize(10).text(totalsText, margin, y, { align: 'right', width: pageWidth - margin * 2 });

    // Notes
    if (invoice.notes) {
      y += 20;
      doc.fontSize(10).text('Notes:', margin, y);
      y += 12;
      doc.text(invoice.notes, margin, y, { width: pageWidth - margin * 2 });
    }

    doc.end();

    stream.on('finish', () => resolve(filePath));
    stream.on('error', (err) => reject(err));
  });
}

