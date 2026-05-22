import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../db/connect.js';
import { authMiddleware, signToken } from '../middleware/auth.js';
import { buildAuthPayload, toPublicUser } from '../utils/authPayload.js';
const router = Router();
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password required' });
        }
        const user = await prisma.user.findUnique({
            where: { email: email.toLowerCase() },
            include: { business: true },
        });
        if (!user) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }
        if (user.role === 'platform_admin') {
            return res.status(401).json({ error: 'Use admin login for platform access' });
        }
        if (!user.businessId || !user.business) {
            return res.status(403).json({ error: 'No business assigned to this account' });
        }
        if (user.business.status !== 'active') {
            return res.status(403).json({ error: 'Business account is suspended' });
        }
        const match = await bcrypt.compare(password, user.passwordHash);
        if (!match) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }
        const payload = buildAuthPayload(user);
        const token = signToken(payload);
        res.json({ token, user: toPublicUser(user) });
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
router.get('/me', authMiddleware, async (req, res) => {
    try {
        const authUser = req.user;
        const dbUser = await prisma.user.findUnique({
            where: { id: authUser.userId },
            include: { business: true },
        });
        if (!dbUser)
            return res.status(401).json({ error: 'User not found' });
        res.json(toPublicUser(dbUser));
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
export default router;
