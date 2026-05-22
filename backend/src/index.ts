import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import cors from 'cors';
import { connectDb } from './db/connect.js';
import { seedAdmin } from './db/seedAdmin.js';
import productsRouter from './routes/products.js';
import customersRouter from './routes/customers.js';
import invoicesRouter from './routes/invoices.js';
import reportsRouter from './routes/reports.js';
import inventoryRouter from './routes/inventory.js';
import authRouter from './routes/auth.js';
import adminRouter from './routes/admin.js';
import dotenv from "dotenv";
dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');
const app = express();

const PORT = process.env.PORT || 1970;

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRouter);
app.use('/api/admin', adminRouter);
app.use('/api/products', productsRouter);
app.use('/api/customers', customersRouter);
app.use('/api/invoices', invoicesRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/inventory', inventoryRouter);

app.get('/api/health', (_req, res) => res.json({ ok: true }));

// Serve generated invoice PDFs publicly at /invoices/INV-*.pdf
const invoicesDir = path.join(projectRoot, 'invoices');
// Ensure directory exists so route is always valid
if (!fs.existsSync(invoicesDir)) {
  fs.mkdirSync(invoicesDir, { recursive: true });
}

// Force download when hitting /invoices/:fileName
app.get('/invoices/:fileName', (req, res) => {
  const fileName = req.params.fileName;
  // Simple whitelist to avoid path traversal
  if (!/^[A-Za-z0-9_.-]+$/.test(fileName)) {
    return res.status(400).send('Invalid file name');
  }
  const fullPath = path.join(invoicesDir, fileName);
  if (!fs.existsSync(fullPath)) {
    return res.status(404).send('Invoice not found');
  }
  res.download(fullPath, fileName);
});

const frontendDist = path.join(__dirname, '..', '..', 'frontend', 'dist');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get('*', (_req, res) => res.sendFile(path.join(frontendDist, 'index.html')));
} else {
  console.warn('frontend/dist not found – backend will serve API only.');
}

async function start() {
  await connectDb();
  await seedAdmin();
  app.listen(PORT, () => {
    console.log(`Barcode Billing API running at http://localhost:${PORT}`);
  });
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
