import bcrypt from 'bcryptjs';
import { prisma } from './connect.js';
const DEFAULT_ADMIN_EMAIL = 'admin@khatushyambooks.com';
const DEFAULT_ADMIN_PASSWORD = 'Admin@123';
export async function seedAdmin() {
    const existing = await prisma.user.findFirst({
        where: { role: 'platform_admin' },
    });
    if (existing)
        return;
    const hash = await bcrypt.hash(DEFAULT_ADMIN_PASSWORD, 10);
    await prisma.user.create({
        data: {
            name: 'Platform Admin',
            email: DEFAULT_ADMIN_EMAIL,
            passwordHash: hash,
            role: 'platform_admin',
        },
    });
    console.log('Default platform admin created:', DEFAULT_ADMIN_EMAIL);
}
