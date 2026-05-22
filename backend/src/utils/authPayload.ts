import type { Business, User } from '@prisma/client';
import type { AuthPayload } from '../middleware/auth.js';

export function buildAuthPayload(
  user: User & { business?: Business | null }
): AuthPayload {
  const payload: AuthPayload = {
    userId: user.id,
    email: user.email,
    name: user.name || undefined,
    role: user.role as AuthPayload['role'],
  };
  if (user.business) {
    payload.businessId = user.business.id;
    payload.schemaName = user.business.schemaName;
  }
  return payload;
}

export function toPublicUser(user: User & { business?: Business | null }) {
  return {
    id: user.id,
    email: user.email,
    name: user.name || '',
    role: user.role,
    businessId: user.businessId,
    businessName: user.business?.name,
  };
}
