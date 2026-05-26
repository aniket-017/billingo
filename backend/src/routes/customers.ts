import { Router } from 'express';
import { authMiddleware, tenantMiddleware } from '../middleware/auth.js';
import { getTenantDb } from '../middleware/tenant.js';
import { parseCustomerPhoneInput } from '../utils/customerPhone.js';

const router = Router();

function phoneConflictMessage(existingName: string): string {
  return `A customer with this phone number already exists (${existingName}).`;
}

function mapCustomerError(e: unknown, res: import('express').Response): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.startsWith('PHONE_CONFLICT:')) {
    const name = msg.slice('PHONE_CONFLICT:'.length) || 'another customer';
    res.status(409).json({ error: phoneConflictMessage(name) });
    return true;
  }
  return false;
}

router.use(authMiddleware, tenantMiddleware);

router.get('/', async (req, res) => {
  try {
    const q = (req.query.q as string)?.trim() || '';
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const customers = await getTenantDb(req).listCustomers(q);
    const total = customers.length;
    const paginated = customers.slice((page - 1) * pageSize, page * pageSize);
    res.json({
      items: paginated,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const customer = await getTenantDb(req).getCustomer(req.params.id);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });
    res.json(customer);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name, phone, email, address } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });

    const phoneResult = parseCustomerPhoneInput(phone);
    if (!phoneResult.ok) {
      return res.status(400).json({ error: phoneResult.error });
    }

    const db = getTenantDb(req);
    if (phoneResult.phone) {
      const existing = await db.findCustomerByPhone(phoneResult.phone);
      if (existing) {
        return res.status(409).json({ error: phoneConflictMessage(existing.name) });
      }
    }

    const customer = await db.createCustomer({
      name: String(name).trim(),
      phone: phoneResult.phone,
      email: email || '',
      address: address || '',
    });
    res.status(201).json(customer);
  } catch (e) {
    if (mapCustomerError(e, res)) return;
    res.status(500).json({ error: (e as Error).message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { name, phone, email, address } = req.body;
    const db = getTenantDb(req);
    const current = await db.getCustomer(req.params.id);
    if (!current) return res.status(404).json({ error: 'Customer not found' });

    let normalizedPhone: string | undefined;
    if (phone !== undefined) {
      const phoneResult = parseCustomerPhoneInput(phone);
      if (!phoneResult.ok) {
        return res.status(400).json({ error: phoneResult.error });
      }
      normalizedPhone = phoneResult.phone;
      if (normalizedPhone) {
        const existing = await db.findCustomerByPhone(normalizedPhone, req.params.id);
        if (existing) {
          return res.status(409).json({ error: phoneConflictMessage(existing.name) });
        }
      }
    }

    const customer = await db.updateCustomer(req.params.id, {
      ...(name !== undefined && { name: String(name).trim() }),
      ...(normalizedPhone !== undefined && { phone: normalizedPhone }),
      ...(email !== undefined && { email }),
      ...(address !== undefined && { address }),
    });
    if (!customer) return res.status(404).json({ error: 'Customer not found' });
    res.json(customer);
  } catch (e) {
    if (mapCustomerError(e, res)) return;
    res.status(500).json({ error: (e as Error).message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const ok = await getTenantDb(req).deleteCustomer(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Customer not found' });
    res.status(204).send();
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

export default router;
