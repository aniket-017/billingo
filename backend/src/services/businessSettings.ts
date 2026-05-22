import { BusinessSettings } from '../models/BusinessSettings.js';

export type BusinessSettingsData = {
  businessName: string;
  address: string;
  phone: string;
  email: string;
  taxId: string;
};

const EMPTY: BusinessSettingsData = {
  businessName: '',
  address: '',
  phone: '',
  email: '',
  taxId: '',
};

function toData(doc: Record<string, unknown> | null): BusinessSettingsData {
  if (!doc) return { ...EMPTY };
  return {
    businessName: String(doc.businessName ?? ''),
    address: String(doc.address ?? ''),
    phone: String(doc.phone ?? ''),
    email: String(doc.email ?? ''),
    taxId: String(doc.taxId ?? ''),
  };
}

export async function getBusinessSettings(): Promise<BusinessSettingsData> {
  let doc = await BusinessSettings.findOne({ singleton: 'default' }).lean();
  if (!doc) {
    doc = (await BusinessSettings.create({ singleton: 'default' })).toObject();
  }
  return toData(doc as Record<string, unknown>);
}

export async function updateBusinessSettings(
  body: Partial<BusinessSettingsData>
): Promise<BusinessSettingsData> {
  const update: Record<string, string> = {};
  if (body.businessName !== undefined) update.businessName = String(body.businessName).trim();
  if (body.address !== undefined) update.address = String(body.address).trim();
  if (body.phone !== undefined) update.phone = String(body.phone).trim();
  if (body.email !== undefined) update.email = String(body.email).trim();
  if (body.taxId !== undefined) update.taxId = String(body.taxId).trim();

  const doc = await BusinessSettings.findOneAndUpdate(
    { singleton: 'default' },
    { $set: update, $setOnInsert: { singleton: 'default' } },
    { new: true, upsert: true }
  ).lean();

  return toData(doc as Record<string, unknown>);
}
