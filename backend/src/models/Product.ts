import mongoose from 'mongoose';

const productSchema = new mongoose.Schema(
  {
    barcode: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    price: { type: Number, required: true },
    unit: { type: String, default: 'pcs' },
    description: { type: String, default: '' },
    quantityOnHand: { type: Number, default: 0, min: 0 },
    reorderLevel: { type: Number, default: 0, min: 0 },
    costPrice: { type: Number, min: 0 },
  },
  { timestamps: true }
);

productSchema.index({ name: 'text' });

export const Product = mongoose.model('Product', productSchema);