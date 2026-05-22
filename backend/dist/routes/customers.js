import { Router } from 'express';
import { authMiddleware, tenantMiddleware } from '../middleware/auth.js';
import { getTenantDb } from '../middleware/tenant.js';
const router = Router();
router.use(authMiddleware, tenantMiddleware);
router.get('/', async (req, res) => {
    try {
        const q = req.query.q?.trim() || '';
        const customers = await getTenantDb(req).listCustomers(q);
        res.json(customers);
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
router.get('/:id', async (req, res) => {
    try {
        const customer = await getTenantDb(req).getCustomer(req.params.id);
        if (!customer)
            return res.status(404).json({ error: 'Customer not found' });
        res.json(customer);
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
router.post('/', async (req, res) => {
    try {
        const { name, phone, email, address } = req.body;
        if (!name)
            return res.status(400).json({ error: 'name is required' });
        const customer = await getTenantDb(req).createCustomer({
            name: String(name).trim(),
            phone: phone || '',
            email: email || '',
            address: address || '',
        });
        res.status(201).json(customer);
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
router.put('/:id', async (req, res) => {
    try {
        const { name, phone, email, address } = req.body;
        const customer = await getTenantDb(req).updateCustomer(req.params.id, {
            ...(name !== undefined && { name: String(name).trim() }),
            ...(phone !== undefined && { phone }),
            ...(email !== undefined && { email }),
            ...(address !== undefined && { address }),
        });
        if (!customer)
            return res.status(404).json({ error: 'Customer not found' });
        res.json(customer);
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
router.delete('/:id', async (req, res) => {
    try {
        const ok = await getTenantDb(req).deleteCustomer(req.params.id);
        if (!ok)
            return res.status(404).json({ error: 'Customer not found' });
        res.status(204).send();
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
export default router;
