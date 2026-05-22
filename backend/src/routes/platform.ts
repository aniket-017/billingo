import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../db/connect.js';
import { createBusinessWithSchema } from '../db/provisionBusiness.js';
import { authMiddleware, platformAdminOnly } from '../middleware/auth.js';

const router = Router();

router.use(authMiddleware, platformAdminOnly);

router.get('/businesses', async (_req, res) => {
  try {
    const businesses = await prisma.business.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { users: true } } },
    });
    res.json(
      businesses.map((b) => ({
        id: b.id,
        slug: b.slug,
        name: b.name,
        schemaName: b.schemaName,
        status: b.status,
        userCount: b._count.users,
        createdAt: b.createdAt,
      }))
    );
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.post('/businesses', async (req, res) => {
  try {
    const { name, slug } = req.body;
    if (!name || !slug) {
      return res.status(400).json({ error: 'name and slug are required' });
    }
    const business = await createBusinessWithSchema({
      name: String(name),
      slug: String(slug),
    });
    res.status(201).json({
      id: business.id,
      slug: business.slug,
      name: business.name,
      schemaName: business.schemaName,
      status: business.status,
    });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.includes('already exists')) {
      return res.status(400).json({ error: msg });
    }
    res.status(500).json({ error: msg });
  }
});

router.get('/businesses/:id/users', async (req, res) => {
  try {
    const business = await prisma.business.findUnique({ where: { id: req.params.id } });
    if (!business) return res.status(404).json({ error: 'Business not found' });

    const users = await prisma.user.findMany({
      where: { businessId: business.id },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json(users);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.post('/businesses/:id/users', async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email and password are required' });
    }

    const business = await prisma.business.findUnique({ where: { id: req.params.id } });
    if (!business) return res.status(404).json({ error: 'Business not found' });

    const normalizedEmail = (email as string).toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) {
      return res.status(400).json({ error: 'User with this email already exists' });
    }

    const userRole =
      role === 'business_admin' ? 'business_admin' : 'user';

    const hash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        name: String(name).trim(),
        email: normalizedEmail,
        passwordHash: hash,
        role: userRole,
        businessId: business.id,
      },
    });

    res.status(201).json({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      businessId: user.businessId,
    });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

export default router;
