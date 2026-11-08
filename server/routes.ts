import { Router } from "express";
import { z } from "zod";
import { atomic, type Db } from "./db.ts";
import { requireState } from "./errors.ts";
import * as v from "./validation.ts";
import * as ops from "./services.ts";

export function apiRoutes(db: Db) {
  const router = Router();

  router.get("/printers", async (req, res) => {
    const { limit: take, offset: skip } = v.listInput.parse(req.query);
    res.json(await db.printer.findMany({ take, skip, orderBy: [{ createdAt: "desc" }, { id: "desc" }] }));
  });
  router.post("/printers", async (req, res) => res.status(201).json(await db.printer.create({ data: v.printerInput.parse(req.body) })));
  router.patch("/printers/:id", async (req, res) => {
    const id = v.id.parse(req.params.id);
    const data = v.printerInput.partial().extend({ isActive: z.boolean().optional() }).parse(req.body);
    res.json(await atomic(db, async (tx) => {
      requireState(!await tx.printJob.findFirst({ where: { printerId: id, status: "PRINTING", voidedAt: null } }), "Finish or void running job before changing printer");
      return tx.printer.update({ where: { id }, data });
    }));
  });

  router.get("/materials", async (req, res) => {
    const { limit: take, offset: skip } = v.listInput.parse(req.query);
    res.json(await db.material.findMany({ take, skip, orderBy: [{ createdAt: "desc" }, { id: "desc" }] }));
  });
  router.post("/materials", async (req, res) => res.status(201).json(await db.material.create({ data: v.materialInput.parse(req.body) })));
  router.patch("/materials/:id", async (req, res) => {
    const id = v.id.parse(req.params.id);
    const data = v.materialInput.partial().extend({ isActive: z.boolean().optional() }).parse(req.body);
    res.json(await atomic(db, async (tx) => {
      if (data.isActive === false) requireState(!await tx.printJob.findFirst({ where: { materialId: id, status: "PRINTING", voidedAt: null } }), "Material has a running job");
      return tx.material.update({ where: { id }, data });
    }));
  });

  router.get("/products", async (req, res) => {
    const { limit: take, offset: skip } = v.listInput.parse(req.query);
    res.json(await atomic(db, async (tx) => {
      const products = await tx.product.findMany({ take, skip, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
      const stocks = await tx.stockMovement.groupBy({ by: ["productId"], where: { productId: { in: products.map((p) => p.id) } }, _sum: { qty: true } });
      return products.map((p) => ({ ...p, onHand: stocks.find((s) => s.productId === p.id)?._sum.qty ?? 0 }));
    }));
  });
  router.post("/products", async (req, res) => {
    const data = v.productInput.parse(req.body);
    res.status(201).json(await atomic(db, async (tx) => {
      requireState((await tx.material.findUniqueOrThrow({ where: { id: data.materialId } })).isActive, "Material is inactive");
      return tx.product.create({ data });
    }));
  });
  router.patch("/products/:id", async (req, res) => {
    const id = v.id.parse(req.params.id);
    // A different material is a different SKU; preserve the historical costing identity.
    const data = v.productInput.omit({ materialId: true }).partial().extend({ isActive: z.boolean().optional() }).parse(req.body);
    res.json(await atomic(db, async (tx) => {
      if (data.isActive === false) requireState(!await tx.printJob.findFirst({ where: { productId: id, status: "PRINTING", voidedAt: null } }), "Product has a running job");
      return tx.product.update({ where: { id }, data });
    }));
  });

  router.get("/purchases", async (req, res) => {
    const { limit: take, offset: skip } = v.listInput.parse(req.query);
    res.json(await db.materialPurchase.findMany({ take, skip, orderBy: [{ createdAt: "desc" }, { id: "desc" }] }));
  });
  router.post("/purchases", async (req, res) => res.status(201).json(await ops.purchase(db, v.purchaseInput.parse(req.body))));
  router.get("/jobs", async (req, res) => {
    const { limit: take, offset: skip, status, voided } = v.jobListInput.parse(req.query);
    res.json(await db.printJob.findMany({ take, skip, where: { status,
      ...(voided === "exclude" ? { voidedAt: null } : voided === "only" ? { voidedAt: { not: null } } : {}),
    }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] }));
  });
  router.post("/jobs", async (req, res) => res.status(201).json(await ops.startJob(db, v.startInput.parse(req.body))));
  router.get("/jobs/:id", async (req, res) => res.json(await db.printJob.findUniqueOrThrow({ where: { id: v.id.parse(req.params.id) } })));
  router.post("/jobs/:id/finish", async (req, res) => res.json(await ops.finishJob(db, v.id.parse(req.params.id), v.finishInput.parse(req.body))));
  router.get("/sales", async (req, res) => {
    const { limit: take, offset: skip, payment, voided } = v.saleListInput.parse(req.query);
    res.json(await db.sale.findMany({ take, skip, where: {
      ...(payment === "paid" ? { paidAt: { not: null } } : payment === "unpaid" ? { paidAt: null } : {}),
      ...(voided === "exclude" ? { voidedAt: null } : voided === "only" ? { voidedAt: { not: null } } : {}),
    }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] }));
  });
  router.post("/sales", async (req, res) => res.status(201).json(await ops.sell(db, v.saleInput.parse(req.body))));
  router.get("/sales/:id", async (req, res) => res.json(await db.sale.findUniqueOrThrow({ where: { id: v.id.parse(req.params.id) } })));
  router.post("/sales/:id/pay", async (req, res) => res.json(await ops.paySale(db, v.id.parse(req.params.id), v.payInput.parse(req.body).paymentMethod)));
  router.get("/adjustments", async (req, res) => {
    const { limit: take, offset: skip } = v.listInput.parse(req.query);
    res.json(await db.stockAdjustment.findMany({ take, skip, orderBy: [{ createdAt: "desc" }, { id: "desc" }] }));
  });
  router.post("/adjustments", async (req, res) => res.status(201).json(await ops.adjust(db, v.adjustmentInput.parse(req.body))));
  router.get("/maintenance", async (req, res) => {
    const { limit: take, offset: skip } = v.listInput.parse(req.query);
    res.json(await db.maintenanceLog.findMany({ take, skip, orderBy: [{ createdAt: "desc" }, { id: "desc" }] }));
  });
  router.post("/maintenance", async (req, res) => res.status(201).json(await ops.maintain(db, v.maintenanceInput.parse(req.body))));
  router.get("/transactions", async (req, res) => {
    const { limit: take, offset: skip } = v.listInput.parse(req.query);
    res.json(await db.transaction.findMany({ take, skip, orderBy: [{ occurredAt: "desc" }, { id: "desc" }] }));
  });
  router.post("/transactions", async (req, res) => res.status(201).json(await ops.manualTransaction(db, v.manualInput.parse(req.body))));
  router.get("/stock-movements", async (req, res) => {
    const { productId, ...pagination } = v.listInput.extend({ productId: v.id.optional() }).parse(req.query);
    res.json(await db.stockMovement.findMany({ where: { productId }, take: pagination.limit, skip: pagination.offset, orderBy: [{ createdAt: "desc" }, { id: "desc" }] }));
  });
  for (const resource of ["sales", "purchases", "jobs", "adjustments", "maintenance", "transactions"] as const) {
    router.post(`/${resource}/:id/void`, async (req, res) => res.json(await ops.voidRecord(db, resource, v.id.parse(req.params.id), v.voidInput.parse(req.body).reason)));
  }
  router.get("/settings", async (_req, res) => res.json(await db.setting.findMany()));
  router.put("/settings/price_per_kwh", async (req, res) => {
    const { value } = z.strictObject({ value: v.money }).parse(req.body);
    res.json(await db.setting.upsert({ where: { key: "price_per_kwh" }, create: { key: "price_per_kwh", value }, update: { value } }));
  });
  return router;
}
