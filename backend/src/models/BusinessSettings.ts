import mongoose from 'mongoose';

const businessSettingsSchema = new mongoose.Schema(
  {
    singleton: { type: String, default: 'default', unique: true },
    businessName: { type: String, default: '' },
    address: { type: String, default: '' },
    phone: { type: String, default: '' },
    email: { type: String, default: '' },
    taxId: { type: String, default: '' },
  },
  { timestamps: true }
);

export const BusinessSettings = mongoose.model('BusinessSettings', businessSettingsSchema);
