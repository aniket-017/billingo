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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const projectRoot = path.join(__dirname, '..');
const app = express();

const PORT = process.env.PORT || 1970;

app.use(cors());
app.use(express.json());

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

const invoicesDir = path.join(projectRoot, 'invoices');
if (!fs.existsSync(invoicesDir)) {
  fs.mkdirSync(invoicesDir, { recursive: true });
}

app.get('/invoices/:fileName', (req, res) => {
  const fileName = req.params.fileName;
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

async function shutdown() {
  await disconnectDb();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
