import jwt from 'jsonwebtoken';
const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';
export function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    }
    catch {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
}
export function tenantMiddleware(req, res, next) {
    const user = req.user;
    if (!user) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    if (user.role === 'platform_admin') {
        return res.status(403).json({ error: 'Store access requires a business account' });
    }
    if (!user.businessId || !user.schemaName) {
        return res.status(403).json({ error: 'No business assigned to this account' });
    }
    req.tenant = {
        businessId: user.businessId,
        schemaName: user.schemaName,
    };
    next();
}
export function platformAdminOnly(req, res, next) {
    const user = req.user;
    if (!user || user.role !== 'platform_admin') {
        return res.status(403).json({ error: 'Platform admin access required' });
    }
    next();
}
/** @deprecated use platformAdminOnly */
export function adminOnly(req, res, next) {
    return platformAdminOnly(req, res, next);
}
export function signToken(payload) {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}
export const TOKEN_EXPIRY = '7d';
