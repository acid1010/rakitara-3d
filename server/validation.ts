import { z } from "zod";
import { AdjustmentReason, FailureReason, MaintenanceType, PaymentMethod } from "@prisma/client";

export const id = z.uuid();
const text = z.string().trim().min(1).max(200);
const note = z.string().trim().max(2000).optional();
const integer = z.number().int().min(0).max(2147483647);
const positive = integer.min(1);
export const money = z.string().regex(/^(0|[1-9]\d{0,11})(\.\d{1,2})?$/, "Use a non-negative decimal string, maximum 12 integer digits and 2 decimal places");
const nonzeroMoney = money.refine((v) => /[1-9]/.test(v), "Must be greater than zero");
const date = z.iso.datetime({ offset: true }).transform((v) => new Date(v));

export const printerInput = z.strictObject({
  name: text, model: text.nullable().optional(), purchaseCost: money,
  lifespanHours: positive, avgWatts: integer, purchasedAt: z.iso.date().transform((v) => new Date(v)).nullable().optional(),
});
export const materialInput = z.strictObject({ name: text, color: text, lowStockGrams: integer.optional() });
export const productInput = z.strictObject({
  name: text, materialId: id, estGrams: positive, estPrintMinutes: positive,
  listPrice: money, isCustom: z.boolean().optional(),
});
export const purchaseInput = z.strictObject({ materialId: id, grams: positive, totalCost: nonzeroMoney, supplier: text.optional() });
export const startInput = z.strictObject({ productId: id, printerId: id, qtyPlanned: positive, note });
export const finishInput = z.strictObject({
  qtyGood: integer, qtyFailed: integer, gramsUsed: positive,
  failureReason: z.enum(FailureReason).optional(), note,
});
export const saleInput = z.strictObject({
  productId: id, qty: positive, unitPrice: nonzeroMoney,
  customerName: text.optional(), customerPhone: text.optional(),
  paymentMethod: z.enum(PaymentMethod).optional(),
});
export const payInput = z.strictObject({ paymentMethod: z.enum(PaymentMethod) });
export const adjustmentInput = z.strictObject({
  productId: id.optional(), materialId: id.optional(),
  qtyDelta: z.number().int().min(-2147483647).max(2147483647).refine((v) => v !== 0),
  reason: z.enum(AdjustmentReason), note,
}).refine((v) => !!v.productId !== !!v.materialId, "Exactly one of productId or materialId is required")
  .refine((v) => v.qtyDelta < 0 || v.reason === "MISCOUNT", "Only MISCOUNT can increase stock");
export const maintenanceInput = z.strictObject({
  printerId: id, type: z.enum(MaintenanceType), notes: note, cost: nonzeroMoney.optional(),
});
export const manualInput = z.strictObject({
  kind: z.enum(["EQUIPMENT_PURCHASE", "ELECTRICITY_BILL", "OPEX", "OWNER_CAPITAL", "OWNER_DRAW"]),
  amount: nonzeroMoney, category: text.optional(), note, occurredAt: date.optional(),
});
export const voidInput = z.strictObject({ reason: z.string().trim().min(1).max(1000) });
export const listInput = z.strictObject({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).max(100000).default(0),
});
export const jobListInput = listInput.extend({
  status: z.enum(["PRINTING", "DONE"]).optional(),
  voided: z.enum(["include", "exclude", "only"]).default("include"),
});
export const saleListInput = listInput.extend({
  payment: z.enum(["paid", "unpaid"]).optional(),
  voided: z.enum(["include", "exclude", "only"]).default("include"),
});
export type PurchaseInput = z.infer<typeof purchaseInput>;
export type StartInput = z.infer<typeof startInput>;
export type FinishInput = z.infer<typeof finishInput>;
export type SaleInput = z.infer<typeof saleInput>;
export type AdjustmentInput = z.infer<typeof adjustmentInput>;
export type MaintenanceInput = z.infer<typeof maintenanceInput>;
export type ManualInput = z.infer<typeof manualInput>;
