import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { getBusinessSettings, updateBusinessSettings } from '../services/businessSettings.js';

const router = Router();

router.get('/', async (_req, res) => {
  try {
    const settings = await getBusinessSettings();
    res.json(settings);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.put('/', authMiddleware, async (req, res) => {
  try {
    const { businessName, address, phone, email, taxId } = req.body;
    const settings = await updateBusinessSettings({
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
