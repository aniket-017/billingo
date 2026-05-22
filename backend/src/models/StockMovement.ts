import mongoose from 'mongoose';

export const STOCK_MOVEMENT_TYPES = [
  'OPENING',
  'STOCK_IN',
  'SALE',
  'ADJUSTMENT',
  'RETURN_IN',
] as const;

export type StockMovementType = (typeof STOCK_MOVEMENT_TYPES)[number];

const stockMovementSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    type: { type: String, enum: STOCK_MOVEMENT_TYPES, required: true },
    quantity: { type: Number, required: true, min: 0 },
    balanceAfter: { type: Number, required: true, min: 0 },
    date: { type: Date, required: true },
    referenceType: { type: String, default: 'manual' },
    referenceId: { type: mongoose.Schema.Types.ObjectId, default: null },
    referenceLabel: { type: String, default: '' },
    notes: { type: String, default: '' },
    createdByEmail: { type: String, default: '' },
    createdByName: { type: String, default: '' },
  },
  { timestamps: true }
);

stockMovementSchema.index({ productId: 1, date: -1 });
stockMovementSchema.index({ date: -1 });
stockMovementSchema.index({ type: 1 });

export const StockMovement = mongoose.model('StockMovement', stockMovementSchema);
