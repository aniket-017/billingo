import type { AuthPayload } from '../middleware/auth.js';
import { createTenantDb } from '../db/tenant.js';
import type { StockMovementType } from '../types/tenant.js';

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
  referenceId?: string | null;
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
  /** Purchase cost per unit when receiving stock; updates weighted average product cost. */
  costPrice?: number;
  dealerName?: string;
  batchNo?: string;
  expiryDate?: string | null;
  mrp?: number;
  sellingPrice?: number;
  numBoxes?: number;
  stripsPerBox?: number;
  tabletsPerStrip?: number;
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

function weightedAverageCost(
  oldQty: number,
  oldCost: number | null,
  recvQty: number,
  recvCost: number
): number {
  const totalQty = oldQty + recvQty;
  if (totalQty <= 0) return recvCost;
  const prior = (oldCost ?? 0) * oldQty;
  return (prior + recvQty * recvCost) / totalQty;
}

export async function applyMovement(schemaName: string, input: ApplyMovementInput) {
  const db = createTenantDb(schemaName);
  const { productId, type, quantity, date, reference, notes, user, costPrice } = input;
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error('quantity must be a positive number');
  }

  const delta = movementDelta(type, quantity);
  const existing = await db.getProduct(productId);
  if (!existing) throw new Error('Product not found');

  if (delta < 0 && (existing.quantityOnHand ?? 0) < quantity) {
    throw new InsufficientStockError(
      productId,
      existing.name,
      quantity,
      existing.quantityOnHand ?? 0
    );
  }

  const product = await db.updateProductQuantity(productId, delta, 0);
  if (!product) {
    throw new InsufficientStockError(
      productId,
      existing.name,
      quantity,
      existing.quantityOnHand ?? 0
    );
  }

  const movement = await db.createMovement({
    productId,
    type,
    quantity,
    balanceAfter: product.quantityOnHand ?? 0,
    date: date ?? new Date(),
    referenceType: reference?.referenceType ?? 'manual',
    referenceId: reference?.referenceId ?? null,
    referenceLabel: reference?.referenceLabel ?? '',
    notes: notes ?? '',
    dealerName: input.dealerName ?? '',
    batchNo: input.batchNo ?? '',
    expiryDate: input.expiryDate ?? null,
    costPrice: input.costPrice ?? null,
    mrp: input.mrp ?? null,
    sellingPrice: input.sellingPrice ?? null,
    numBoxes: input.numBoxes ?? 1,
    stripsPerBox: input.stripsPerBox ?? 1,
    tabletsPerStrip: input.tabletsPerStrip ?? 1,
    createdByEmail: user?.email ?? '',
    createdByName: user?.name ?? '',
  });

  let updatedProduct = product;
  if (
    type === 'STOCK_IN' &&
    costPrice != null &&
    Number.isFinite(costPrice) &&
    costPrice >= 0
  ) {
    const oldQty = existing.quantityOnHand ?? 0;
    const newCost = weightedAverageCost(oldQty, existing.costPrice, quantity, costPrice);
    const withCost = await db.updateProduct(productId, { costPrice: newCost });
    if (withCost) updatedProduct = withCost;
  }

  return { product: updatedProduct, movement };
}

export async function applyAdjustment(
  schemaName: string,
  input: {
    productId: string;
    quantityDelta: number;
    date?: Date;
    notes?: string;
    user?: AuthPayload;
  }
) {
  const db = createTenantDb(schemaName);
  const { productId, quantityDelta, date, notes, user } = input;
  if (!Number.isFinite(quantityDelta) || quantityDelta === 0) {
    throw new Error('quantityDelta must be a non-zero number');
  }

  const absQty = Math.abs(quantityDelta);
  const existing = await db.getProduct(productId);
  if (!existing) throw new Error('Product not found');

  if (quantityDelta < 0 && (existing.quantityOnHand ?? 0) < absQty) {
    throw new InsufficientStockError(
      productId,
      existing.name,
      absQty,
      existing.quantityOnHand ?? 0
    );
  }

  const product = await db.updateProductQuantity(productId, quantityDelta, 0);
  if (!product) {
    throw new InsufficientStockError(
      productId,
      existing.name,
      absQty,
      existing.quantityOnHand ?? 0
    );
  }

  const movement = await db.createMovement({
    productId,
    type: 'ADJUSTMENT',
    quantity: absQty,
    balanceAfter: product.quantityOnHand ?? 0,
    date: date ?? new Date(),
    notes:
      notes ?? (quantityDelta > 0 ? `Adjustment +${absQty}` : `Adjustment -${absQty}`),
    createdByEmail: user?.email ?? '',
    createdByName: user?.name ?? '',
  });

  return { product, movement };
}

export interface AppliedSale {
  productId: string;
  quantity: number;
}

export async function deductForSale(
  schemaName: string,
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
      const result = await applyMovement(schemaName, {
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
    await restoreSaleDeduction(schemaName, applied);
    throw err;
  }
}

export async function linkSaleMovementsToInvoice(
  schemaName: string,
  invoiceId: string,
  invoiceNumber: string
) {
  await createTenantDb(schemaName).linkSaleMovementsToInvoice(invoiceId, invoiceNumber);
}

export async function restoreSaleDeduction(schemaName: string, items: AppliedSale[]) {
  const db = createTenantDb(schemaName);
  for (const { productId, quantity } of items) {
    const product = await db.updateProductQuantity(productId, quantity, 0);
    await db.createMovement({
      productId,
      type: 'RETURN_IN',
      quantity,
      balanceAfter: product?.quantityOnHand ?? 0,
      date: new Date(),
      referenceType: 'invoice',
      referenceId: null,
      referenceLabel: '',
      notes: 'Sale rollback (invoice creation failed)',
    });
  }
}

export function stockStatus(
  quantityOnHand: number,
  reorderLevel: number
): 'in_stock' | 'low' | 'out' {
  if (quantityOnHand <= 0) return 'out';
  if (reorderLevel > 0 && quantityOnHand <= reorderLevel) return 'low';
  return 'in_stock';
}
