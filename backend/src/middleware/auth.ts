import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';

export type UserRole = 'platform_admin' | 'business_admin' | 'user';

export interface AuthPayload {
  userId: string;
  email: string;
  name?: string;
  role: UserRole;
  businessId?: string;
  schemaName?: string;
}

export interface TenantContext {
  businessId: string;
  schemaName: string;
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthPayload;
    (req as Request & { user?: AuthPayload }).user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function tenantMiddleware(req: Request, res: Response, next: NextFunction) {
  const user = (req as Request & { user?: AuthPayload }).user;
  if (!user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  if (user.role === 'platform_admin') {
    return res.status(403).json({ error: 'Store access requires a business account' });
  }
  if (!user.businessId || !user.schemaName) {
    return res.status(403).json({ error: 'No business assigned to this account' });
  }
  (req as Request & { tenant?: TenantContext }).tenant = {
    businessId: user.businessId,
    schemaName: user.schemaName,
  };
  next();
}

export function platformAdminOnly(req: Request, res: Response, next: NextFunction) {
  const user = (req as Request & { user?: AuthPayload }).user;
  if (!user || user.role !== 'platform_admin') {
    return res.status(403).json({ error: 'Platform admin access required' });
  }
  next();
}

/** @deprecated use platformAdminOnly */
export function adminOnly(req: Request, res: Response, next: NextFunction) {
  return platformAdminOnly(req, res, next);
}

export function signToken(payload: AuthPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

export const TOKEN_EXPIRY = '7d';
