import mongoose from 'mongoose';
import { Product } from '../models/Product.js';
import { StockMovement, StockMovementType } from '../models/StockMovement.js';
import type { AuthPayload } from '../middleware/auth.js';

export class InsufficientStockError extends Error {
  constructor(
    public productId: string,
    public productName: string,
    public requested: number,
    public available: number
  ) {
    super(`Insufficient stock for ${productName}: requested ${requested}, available ${available}`);
    this.name = 'InsufficientStockError';
  }
}

const IN_TYPES: StockMovementType[] = ['OPENING', 'STOCK_IN', 'RETURN_IN'];
const OUT_TYPES: StockMovementType[] = ['SALE'];

export interface MovementReference {
  referenceType?: string;
  referenceId?: mongoose.Types.ObjectId | string | null | undefined;
  referenceLabel?: string;
}

export interface ApplyMovementInput {
  productId: string;
  type: StockMovementType;
  quantity: number;
  date?: Date;
  reference?: MovementReference;
  notes?: string;
  user?: AuthPayload;
}

export interface SaleLineItem {
  productId: string;
  productName: string;
  quantity: number;
}

function movementDelta(type: StockMovementType, quantity: number): number {
  if (IN_TYPES.includes(type)) return quantity;
  if (OUT_TYPES.includes(type)) return -quantity;
  return quantity;
}

export async function applyMovement(input: ApplyMovementInput) {
  const { productId, type, quantity, date, reference, notes, user } = input;
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error('quantity must be a positive number');
  }

  const delta = movementDelta(type, quantity);
  const movementDate = date ?? new Date();

  let filter: Record<string, unknown> = { _id: productId };
  let update: Record<string, unknown> = { $inc: { quantityOnHand: delta } };

  if (delta < 0) {
    filter = { _id: productId, quantityOnHand: { $gte: quantity } };
  }

  const product = await Product.findOneAndUpdate(filter, update, { new: true }).lean();
  if (!product) {
    const existing = await Product.findById(productId).lean();
    if (!existing) throw new Error('Product not found');
    const available = existing.quantityOnHand ?? 0;
    throw new InsufficientStockError(
      String(productId),
      existing.name,
      quantity,
      available
    );
  }

  const balanceAfter = product.quantityOnHand ?? 0;
  const movement = await StockMovement.create({
    productId,
    type,
    quantity,
    balanceAfter,
    date: movementDate,
    referenceType: reference?.referenceType ?? 'manual',
    referenceId: reference?.referenceId ?? null,
    referenceLabel: reference?.referenceLabel ?? '',
    notes: notes ?? '',
    createdByEmail: user?.email ?? '',
    createdByName: user?.name ?? '',
  });

  return { product, movement: movement.toObject() };
}

export async function applyAdjustment(input: {
  productId: string;
  quantityDelta: number;
  date?: Date;
  notes?: string;
  user?: AuthPayload;
}) {
  const { productId, quantityDelta, date, notes, user } = input;
  if (!Number.isFinite(quantityDelta) || quantityDelta === 0) {
    throw new Error('quantityDelta must be a non-zero number');
  }

  const absQty = Math.abs(quantityDelta);
  const movementDate = date ?? new Date();

  let filter: Record<string, unknown> = { _id: productId };
  const update = { $inc: { quantityOnHand: quantityDelta } };

  if (quantityDelta < 0) {
    filter = { _id: productId, quantityOnHand: { $gte: absQty } };
  }

  const product = await Product.findOneAndUpdate(filter, update, { new: true }).lean();
  if (!product) {
    const existing = await Product.findById(productId).lean();
    if (!existing) throw new Error('Product not found');
    const available = existing.quantityOnHand ?? 0;
    throw new InsufficientStockError(
      String(productId),
      existing.name,
      absQty,
      available
    );
  }

  const balanceAfter = product.quantityOnHand ?? 0;
  const movement = await StockMovement.create({
    productId,
    type: 'ADJUSTMENT',
    quantity: absQty,
    balanceAfter,
    date: movementDate,
    referenceType: 'manual',
    referenceId: null,
    referenceLabel: '',
    notes: notes ?? (quantityDelta > 0 ? `Adjustment +${absQty}` : `Adjustment -${absQty}`),
    createdByEmail: user?.email ?? '',
    createdByName: user?.name ?? '',
  });

  return { product, movement: movement.toObject() };
}

export interface AppliedSale {
  productId: string;
  quantity: number;
}

export async function deductForSale(
  items: SaleLineItem[],
  reference: MovementReference,
  user?: AuthPayload
) {
  const aggregated = new Map<string, { productName: string; quantity: number }>();
  for (const item of items) {
    const key = String(item.productId);
    const prev = aggregated.get(key);
    if (prev) {
      prev.quantity += item.quantity;
    } else {
      aggregated.set(key, { productName: item.productName, quantity: item.quantity });
    }
  }

  const applied: AppliedSale[] = [];
  const movements: Awaited<ReturnType<typeof applyMovement>>['movement'][] = [];

  try {
    for (const [productId, { productName, quantity }] of aggregated) {
      const result = await applyMovement({
        productId,
        type: 'SALE',
        quantity,
        date: new Date(),
        reference: {
          referenceType: reference.referenceType ?? 'invoice',
          referenceId: reference.referenceId,
          referenceLabel: reference.referenceLabel ?? '',
        },
        notes: `Sale: ${productName}`,
        user,
      });
      applied.push({ productId, quantity });
      movements.push(result.movement);
    }
    return { movements, applied };
  } catch (err) {
    await restoreSaleDeduction(applied);
    throw err;
  }
}

export async function linkSaleMovementsToInvoice(
  invoiceId: mongoose.Types.ObjectId | string,
  invoiceNumber: string
) {
  await StockMovement.updateMany(
    {
      type: 'SALE',
      referenceId: null,
      referenceType: 'invoice',
      referenceLabel: invoiceNumber,
    },
    { $set: { referenceId: invoiceId } }
  );
}

export async function restoreSaleDeduction(items: AppliedSale[]) {
  for (const { productId, quantity } of items) {
    const product = await Product.findByIdAndUpdate(
      productId,
      { $inc: { quantityOnHand: quantity } },
      { new: true }
    ).lean();
    await StockMovement.create({
      productId,
      type: 'RETURN_IN',
      quantity,
      balanceAfter: product?.quantityOnHand ?? 0,
      date: new Date(),
      referenceType: 'invoice',
      referenceId: null,
      referenceLabel: '',
      notes: 'Sale rollback (invoice creation failed)',
      createdByEmail: '',
      createdByName: '',
    });
  }
}

export function stockStatus(quantityOnHand: number, reorderLevel: number): 'in_stock' | 'low' | 'out' {
  if (quantityOnHand <= 0) return 'out';
  if (reorderLevel > 0 && quantityOnHand <= reorderLevel) return 'low';
  return 'in_stock';
}
