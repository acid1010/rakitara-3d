import { Prisma, type PaymentMethod } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { atomic, type Db, type Tx } from "./db.ts";
import { average, cash, cost, jobCosts } from "./costing.ts";
import { requireState } from "./errors.ts";
import type { AdjustmentInput, FinishInput, MaintenanceInput, ManualInput, PurchaseInput, SaleInput, StartInput } from "./validation.ts";

export async function onHand(tx: Tx, productId: string) {
  return (await tx.stockMovement.aggregate({ where: { productId }, _sum: { qty: true } }))._sum.qty ?? 0;
}

export function purchase(db: Db, input: PurchaseInput) {
  return atomic(db, async (tx) => {
    const material = await tx.material.findUniqueOrThrow({ where: { id: input.materialId } });
    requireState(material.isActive, "Material is inactive");
    const row = await tx.materialPurchase.create({ data: input });
    const avgCostPerGram = average(material.stockGrams, material.avgCostPerGram, input.grams, new Prisma.Decimal(input.totalCost).div(input.grams));
    await tx.material.update({ where: { id: material.id }, data: { stockGrams: { increment: input.grams }, avgCostPerGram } });
    await tx.transaction.create({ data: {
      materialPurchaseId: row.id, occurredAt: row.purchasedAt, direction: "OUT", kind: "MATERIAL_PURCHASE",
      amount: input.totalCost, affectsCash: true, affectsPnl: false, source: "AUTO",
    } });
    return row;
  });
}

export function startJob(db: Db, input: StartInput) {
  return atomic(db, async (tx) => {
    const product = await tx.product.findUniqueOrThrow({ where: { id: input.productId }, include: { material: true } });
    const printer = await tx.printer.findUniqueOrThrow({ where: { id: input.printerId } });
    requireState(product.isActive && product.material.isActive && printer.isActive, "Product, material and printer must be active");
    requireState(!await tx.printJob.findFirst({ where: { printerId: printer.id, status: "PRINTING", voidedAt: null } }), "Printer already has a running job");
    return tx.printJob.create({ data: { ...input, materialId: product.materialId, startedAt: new Date() } });
  });
}

export function finishJob(db: Db, jobId: string, input: FinishInput) {
  return atomic(db, async (tx) => {
    const job = await tx.printJob.findUniqueOrThrow({ where: { id: jobId }, include: { printer: true, material: true, product: true } });
    requireState(!job.voidedAt && job.status === "PRINTING", "Job is not running");
    requireState(input.qtyGood + input.qtyFailed === job.qtyPlanned, "Good + failed must equal planned quantity");
    requireState(input.qtyFailed === 0 ? !input.failureReason : !!input.failureReason, "Failure reason required only when units failed");
    requireState(job.material.stockGrams >= input.gramsUsed, "Insufficient material stock");
    const setting = await tx.setting.findUnique({ where: { key: "price_per_kwh" } });
    requireState(setting, "Set price_per_kwh before finishing jobs");
    const finishedAt = new Date();
    const costs = jobCosts({ ...input, avgCostPerGram: job.material.avgCostPerGram,
      durationMs: finishedAt.getTime() - job.startedAt.getTime(), purchaseCost: job.printer.purchaseCost,
      lifespanHours: job.printer.lifespanHours, avgWatts: job.printer.avgWatts, pricePerKwh: new Prisma.Decimal(setting.value) });
    const { total, ...snapshot } = costs;
    await tx.material.update({ where: { id: job.materialId }, data: { stockGrams: { decrement: input.gramsUsed } } });
    if (input.qtyGood && costs.unitCost) {
      const qty = await onHand(tx, job.productId);
      await tx.product.update({ where: { id: job.productId }, data: { avgCost: average(qty, job.product.avgCost, input.qtyGood, costs.unitCost) } });
      await tx.stockMovement.create({ data: { productId: job.productId, printJobId: job.id, type: "PRODUCTION", qty: input.qtyGood, unitCost: costs.unitCost } });
    } else if (cash(total).gt(0)) {
      await tx.transaction.create({ data: { printJobId: job.id, occurredAt: finishedAt, direction: "OUT", kind: "WASTE", amount: cash(total), affectsCash: false, affectsPnl: true, source: "AUTO" } });
    }
    return tx.printJob.update({ where: { id: job.id }, data: { ...input, ...snapshot, finishedAt, status: "DONE" } });
  });
}

async function recordPayment(tx: Tx, sale: { id: string; qty: number; unitPrice: Prisma.Decimal }, method: PaymentMethod) {
  const paidAt = new Date();
  await tx.transaction.create({ data: { saleId: sale.id, occurredAt: paidAt, direction: "IN", kind: "SALE_PAYMENT", amount: cash(sale.unitPrice.mul(sale.qty)), affectsCash: true, affectsPnl: false, source: "AUTO" } });
  return tx.sale.update({ where: { id: sale.id }, data: { paidAt, paymentMethod: method } });
}

export function sell(db: Db, input: SaleInput) {
  return atomic(db, async (tx) => {
    const product = await tx.product.findUniqueOrThrow({ where: { id: input.productId } });
    requireState(product.isActive, "Product is inactive");
    const qty = await onHand(tx, product.id);
    requireState(qty >= input.qty, "Insufficient product stock");
    const { paymentMethod, ...data } = input;
    const sale = await tx.sale.create({ data: { ...data, saleNo: `SALE-${randomUUID()}`, unitCogs: product.avgCost } });
    await tx.stockMovement.create({ data: { productId: product.id, saleId: sale.id, type: "SALE", qty: -input.qty, unitCost: product.avgCost } });
    if (qty === input.qty) await tx.product.update({ where: { id: product.id }, data: { avgCost: 0 } });
    return paymentMethod ? recordPayment(tx, sale, paymentMethod) : sale;
  });
}

export function paySale(db: Db, saleId: string, method: PaymentMethod) {
  return atomic(db, async (tx) => {
    const sale = await tx.sale.findUniqueOrThrow({ where: { id: saleId } });
    requireState(!sale.voidedAt && !sale.paidAt, "Sale is voided or already paid");
    return recordPayment(tx, sale, method);
  });
}

export function adjust(db: Db, input: AdjustmentInput) {
  return atomic(db, async (tx) => {
    const unitCost = input.productId
      ? (await tx.product.findUniqueOrThrow({ where: { id: input.productId } })).avgCost
      : (await tx.material.findUniqueOrThrow({ where: { id: input.materialId! } })).avgCostPerGram;
    const oldQty = input.productId ? await onHand(tx, input.productId)
      : (await tx.material.findUniqueOrThrow({ where: { id: input.materialId! } })).stockGrams;
    requireState(oldQty + input.qtyDelta >= 0, "Adjustment would make stock negative");
    requireState(input.qtyDelta < 0 || (oldQty > 0 && unitCost.gt(0)), "Positive adjustments require existing valued stock; record a purchase or production first");
    const costImpact = cash(unitCost.mul(input.qtyDelta));
    const row = await tx.stockAdjustment.create({ data: { ...input, costImpact } });
    if (input.productId) {
      await tx.stockMovement.create({ data: { productId: input.productId, adjustmentId: row.id, type: "ADJUSTMENT", qty: input.qtyDelta, unitCost } });
      if (oldQty + input.qtyDelta === 0) await tx.product.update({ where: { id: input.productId }, data: { avgCost: 0 } });
    } else {
      await tx.material.update({ where: { id: input.materialId! }, data: { stockGrams: { increment: input.qtyDelta } } });
    }
    if (!costImpact.isZero()) await tx.transaction.create({ data: {
      adjustmentId: row.id, occurredAt: row.createdAt, direction: costImpact.gt(0) ? "IN" : "OUT", kind: "INVENTORY_ADJUSTMENT",
      amount: costImpact.abs(), affectsCash: false, affectsPnl: true, source: "AUTO",
    } });
    return row;
  });
}

export function maintain(db: Db, input: MaintenanceInput) {
  return atomic(db, async (tx) => {
    const printer = await tx.printer.findUniqueOrThrow({ where: { id: input.printerId } });
    requireState(printer.isActive, "Printer is inactive");
    const row = await tx.maintenanceLog.create({ data: input });
    if (input.cost) await tx.transaction.create({ data: { maintenanceId: row.id, occurredAt: row.performedAt, direction: "OUT", kind: "OPEX", amount: input.cost, affectsCash: true, affectsPnl: true, source: "AUTO" } });
    return row;
  });
}

export function manualTransaction(db: Db, input: ManualInput) {
  return atomic(db, (tx) => tx.transaction.create({ data: {
    ...input, occurredAt: input.occurredAt ?? new Date(), direction: input.kind === "OWNER_CAPITAL" ? "IN" : "OUT",
    affectsCash: true, affectsPnl: input.kind === "OPEX", source: "MANUAL",
  } }));
}

async function reverseMovement(tx: Tx, row: { id: string; productId: string; qty: number; unitCost: Prisma.Decimal; createdAt: Date; printJobId: string | null; saleId: string | null; adjustmentId: string | null; type: "PRODUCTION" | "SALE" | "ADJUSTMENT" }) {
  // shortcut: only the latest product movement can reverse; add historical revaluation before relaxing this.
  requireState(!await tx.stockMovement.findFirst({ where: { productId: row.productId, id: { not: row.id }, createdAt: { gte: row.createdAt } } }), "Later stock activity prevents reversal; use an adjustment");
  const product = await tx.product.findUniqueOrThrow({ where: { id: row.productId } });
  const qty = await onHand(tx, row.productId);
  requireState(qty - row.qty >= 0, "Reversal would make stock negative");
  requireState(row.type !== "PRODUCTION" || qty === row.qty, "Production mixed with earlier stock requires historical revaluation; use an adjustment");
  const value = product.avgCost.mul(qty).sub(row.unitCost.mul(row.qty));
  requireState(value.gte(0), "Reversal requires historical revaluation");
  await tx.product.update({ where: { id: row.productId }, data: { avgCost: qty === row.qty ? 0 : cost(value.div(qty - row.qty)) } });
  const { productId, printJobId, saleId, adjustmentId, type, unitCost } = row;
  await tx.stockMovement.create({ data: { productId, printJobId, saleId, adjustmentId, type, unitCost, qty: -row.qty, isReversal: true } });
}

async function untouchedMaterial(tx: Tx, materialId: string, since: Date, exceptJobId?: string, exceptAdjustmentId?: string, exceptPurchaseId?: string) {
  const purchase = await tx.materialPurchase.findFirst({ where: { materialId, createdAt: { gte: since }, ...(exceptPurchaseId ? { id: { not: exceptPurchaseId } } : {}) } });
  const job = await tx.printJob.findFirst({ where: { materialId, finishedAt: { gte: since }, ...(exceptJobId ? { id: { not: exceptJobId } } : {}) } });
  const adjustment = await tx.stockAdjustment.findFirst({ where: { materialId, createdAt: { gte: since }, ...(exceptAdjustmentId ? { id: { not: exceptAdjustmentId } } : {}) } });
  requireState(!purchase && !job && !adjustment, "Later material activity prevents reversal; use an adjustment");
}

export type VoidResource = "sales" | "purchases" | "jobs" | "adjustments" | "maintenance" | "transactions";
export function voidRecord(db: Db, resource: VoidResource, id: string, reason: string) {
  return atomic(db, async (tx) => {
    const voidData = { voidedAt: new Date(), voidReason: reason };
    const movement = await tx.stockMovement.findFirst({ where: { isReversal: false, ...(resource === "sales" ? { saleId: id } : resource === "jobs" ? { printJobId: id } : { adjustmentId: id }) } });
    let result;
    if (resource === "sales") {
      const sale = await tx.sale.findUniqueOrThrow({ where: { id } });
      requireState(!sale.voidedAt, "Sale already voided");
      requireState(!sale.paidAt, "Paid sales require a refund workflow; cannot void cash already received");
      requireState(movement, "Missing stock movement");
      await reverseMovement(tx, movement);
      result = await tx.sale.update({ where: { id }, data: voidData });
    } else if (resource === "purchases") {
      const row = await tx.materialPurchase.findUniqueOrThrow({ where: { id } });
      requireState(!row.voidedAt, "Purchase already voided");
      // A purchase void corrects an erroneous entry; it does not issue a supplier refund.
      await untouchedMaterial(tx, row.materialId, row.createdAt, undefined, undefined, id);
      const material = await tx.material.findUniqueOrThrow({ where: { id: row.materialId } });
      requireState(material.stockGrams >= row.grams, "Purchased material has been consumed");
      requireState(material.stockGrams === row.grams, "Purchase mixed with earlier stock requires historical revaluation; use an adjustment");
      await tx.material.update({ where: { id: row.materialId }, data: { stockGrams: 0, avgCostPerGram: 0 } });
      result = await tx.materialPurchase.update({ where: { id }, data: voidData });
    } else if (resource === "jobs") {
      const row = await tx.printJob.findUniqueOrThrow({ where: { id } });
      requireState(!row.voidedAt, "Job already voided");
      if (row.status === "DONE") {
        await untouchedMaterial(tx, row.materialId, row.finishedAt!, id);
        if (movement) await reverseMovement(tx, movement);
        await tx.material.update({ where: { id: row.materialId }, data: { stockGrams: { increment: row.gramsUsed! } } });
      }
      result = await tx.printJob.update({ where: { id }, data: voidData });
    } else if (resource === "adjustments") {
      const row = await tx.stockAdjustment.findUniqueOrThrow({ where: { id } });
      requireState(!row.voidedAt, "Adjustment already voided");
      if (row.productId) {
        requireState(movement, "Missing stock movement");
        await reverseMovement(tx, movement);
      } else {
        await untouchedMaterial(tx, row.materialId!, row.createdAt, undefined, id);
        const material = await tx.material.findUniqueOrThrow({ where: { id: row.materialId! } });
        requireState(material.stockGrams - row.qtyDelta >= 0, "Reversal would make material stock negative");
        await tx.material.update({ where: { id: material.id }, data: { stockGrams: { decrement: row.qtyDelta } } });
      }
      result = await tx.stockAdjustment.update({ where: { id }, data: voidData });
    } else if (resource === "maintenance") {
      const row = await tx.maintenanceLog.findUniqueOrThrow({ where: { id } });
      requireState(!row.voidedAt, "Maintenance already voided");
      result = await tx.maintenanceLog.update({ where: { id }, data: voidData });
    } else {
      const row = await tx.transaction.findUniqueOrThrow({ where: { id } });
      requireState(row.source === "MANUAL" && !row.voidedAt, "Only active MANUAL transactions can be voided directly");
      return tx.transaction.update({ where: { id }, data: voidData });
    }
    const source = resource === "sales" ? { saleId: id } : resource === "purchases" ? { materialPurchaseId: id }
      : resource === "jobs" ? { printJobId: id } : resource === "adjustments" ? { adjustmentId: id } : { maintenanceId: id };
    await tx.transaction.updateMany({ where: { ...source, voidedAt: null }, data: voidData });
    return result;
  });
}
