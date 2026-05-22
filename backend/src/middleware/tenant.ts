import { Request } from 'express';
import { createTenantDb, TenantDb } from '../db/tenant.js';
import type { TenantContext } from './auth.js';

export function getTenant(req: Request): TenantContext {
  const tenant = (req as Request & { tenant?: TenantContext }).tenant;
  if (!tenant) {
    throw new Error('Tenant context missing');
  }
  return tenant;
}

export function getTenantDb(req: Request): TenantDb {
  return createTenantDb(getTenant(req).schemaName);
}
