import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../db/connect.js';
import { signToken } from '../middleware/auth.js';
import { buildAuthPayload, toPublicUser } from '../utils/authPayload.js';

const router = Router();

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const user = await prisma.user.findUnique({
      where: { email: (email as string).toLowerCase() },
      include: { business: true },
    });
    if (!user || user.role !== 'platform_admin') {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const payload = buildAuthPayload(user);
    const token = signToken(payload);
    res.json({ token, user: toPublicUser(user) });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

export default router;
