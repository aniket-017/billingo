import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import cors from 'cors';
import dotenv from 'dotenv';
import { connectDb, disconnectDb, ensureDbConnection } from './db/connect.js';
import { seedAdmin } from './db/seedAdmin.js';
import productsRouter from './routes/products.js';
import customersRouter from './routes/customers.js';
import invoicesRouter from './routes/invoices.js';
import reportsRouter from './routes/reports.js';
import inventoryRouter from './routes/inventory.js';
import authRouter from './routes/auth.js';
import adminRouter from './routes/admin.js';
import platformRouter from './routes/platform.js';
import settingsRouter from './routes/settings.js';
import whatsappWebhookRouter from './routes/whatsappWebhook.js';
import { migrateTenantWhatsAppColumns } from './db/migrateTenantWhatsApp.js';
import { migrateTenantCustomerPhoneUnique } from './db/migrateTenantCustomerPhone.js';
import { migrateTenantInvoiceItemCost } from './db/migrateTenantInvoiceItemCost.js';
import { migrateTenantProductCategory } from './db/migrateTenantProductCategory.js';
import { migrateTenantBulkFields } from './db/migrateTenantBulkFields.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const app = express();

const PORT = process.env.PORT || 1975;

app.use(cors());
app.use(express.json());

// Meta WhatsApp webhook (no auth — called by Facebook)
app.use('/webhook/whatsapp', whatsappWebhookRouter);

// Neon may drop idle connections; verify pool before each API request
app.use('/api', async (_req, _res, next) => {
  try {
    await ensureDbConnection();
    next();
  } catch (err) {
    next(err);
  }
});

app.use('/api/auth', authRouter);
app.use('/api/admin', adminRouter);
app.use('/api/platform', platformRouter);
app.use('/api/products', productsRouter);
app.use('/api/customers', customersRouter);
app.use('/api/invoices', invoicesRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/inventory', inventoryRouter);
app.use('/api/settings', settingsRouter);

app.get('/api/health', (_req, res) => res.json({ ok: true }));

const frontendDist = path.join(__dirname, '..', '..', 'frontend', 'dist');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get('*', (_req, res) => res.sendFile(path.join(frontendDist, 'index.html')));
} else {
  console.warn('frontend/dist not found – backend will serve API only.');
}

async function start() {
  await connectDb();
  await migrateTenantWhatsAppColumns();
  await migrateTenantCustomerPhoneUnique();
  await migrateTenantInvoiceItemCost();
  await migrateTenantProductCategory();
  await migrateTenantBulkFields();
  await seedAdmin();
  app.listen(PORT, () => {
    console.log(`Plan2Automate API running at http://localhost:${PORT}`);
  });
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});

async function shutdown() {
  await disconnectDb();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
