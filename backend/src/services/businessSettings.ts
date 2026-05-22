import type { BusinessSettingsData } from '../types/tenant.js';
import { createTenantDb } from '../db/tenant.js';

export type { BusinessSettingsData };

export async function getBusinessSettings(schemaName: string): Promise<BusinessSettingsData> {
  return createTenantDb(schemaName).getSettings();
}

export async function updateBusinessSettings(
  schemaName: string,
  body: Partial<BusinessSettingsData>
): Promise<BusinessSettingsData> {
  const update: Partial<BusinessSettingsData> = {};
  if (body.businessName !== undefined) update.businessName = String(body.businessName).trim();
  if (body.address !== undefined) update.address = String(body.address).trim();
  if (body.phone !== undefined) update.phone = String(body.phone).trim();
  if (body.email !== undefined) update.email = String(body.email).trim();
  if (body.taxId !== undefined) update.taxId = String(body.taxId).trim();
  return createTenantDb(schemaName).updateSettings(update);
}
