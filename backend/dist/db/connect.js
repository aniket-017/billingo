import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
dotenv.config();
const globalForPrisma = globalThis;
export const prisma = globalForPrisma.prisma ??
    new PrismaClient({
        log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    });
if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = prisma;
}
export async function connectDb() {
    if (!process.env.DATABASE_URL) {
        throw new Error('DATABASE_URL is not defined in environment variables');
    }
    await prisma.$connect();
    console.log('PostgreSQL connected');
}
export async function disconnectDb() {
    await prisma.$disconnect();
}
