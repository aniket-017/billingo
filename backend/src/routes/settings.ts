import { Router } from 'express';
import { authMiddleware, tenantMiddleware } from '../middleware/auth.js';
import { getTenant } from '../middleware/tenant.js';
import { getBusinessSettings, updateBusinessSettings } from '../services/businessSettings.js';

const router = Router();

router.use(authMiddleware, tenantMiddleware);

router.get('/', async (req, res) => {
  try {
    const settings = await getBusinessSettings(getTenant(req).schemaName);
    res.json(settings);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.put('/', async (req, res) => {
  try {
    const { businessName, address, phone, email, taxId } = req.body;
    const settings = await updateBusinessSettings(getTenant(req).schemaName, {
      ...(businessName !== undefined && { businessName }),
      ...(address !== undefined && { address }),
      ...(phone !== undefined && { phone }),
      ...(email !== undefined && { email }),
      ...(taxId !== undefined && { taxId }),
    });
    res.json(settings);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

export default router;
