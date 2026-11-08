import { afterAll, beforeAll, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import type { Server } from "node:http";
import pg from "pg";
import { createDb, type Db } from "./db.ts";
import { createApp } from "./app.ts";
import { readConfig } from "./config.ts";
import { hashPassword } from "./password.ts";
import * as ops from "./services.ts";

// Only an explicitly supplied test database is used; every run gets an isolated schema.
const databaseUrl = process.env.TEST_DATABASE_URL;
const integration = databaseUrl ? test : test.skip;
const schema = `api_test_${crypto.randomUUID().replaceAll("-", "")}`;
let admin: pg.Client;
let db: Db;
let http: Server;
let closeStore: () => Promise<void>;
let base: string;
let cookie: string;
const origin = "http://localhost:3000";

beforeAll(async () => {
  if (!databaseUrl) return;
  admin = new pg.Client({ connectionString: databaseUrl });
  await admin.connect();
  await admin.query(`CREATE SCHEMA "${schema}"`);
  const url = new URL(databaseUrl);
  url.searchParams.set("schema", schema);
  url.searchParams.set("options", `-c search_path=${schema}`);
  const setup = new pg.Client({ connectionString: url.toString() });
  await setup.connect();
  try {
    for (const name of ["202611080001_initial", "202611080002_api_safety"]) {
      await setup.query(await readFile(new URL(`../prisma/migrations/${name}/migration.sql`, import.meta.url), "utf8"));
    }
  } finally { await setup.end(); }
  db = createDb(url.toString());
  const { app, sessionStore } = createApp(readConfig({ NODE_ENV: "test", DATABASE_URL: url.toString(), APP_ORIGIN: origin,
    SESSION_SECRET: "test-only-secret-".repeat(3), ADMIN_USERNAME: "owner", ADMIN_PASSWORD_HASH: await hashPassword("long-owner-password") }), db);
  closeStore = async () => { await sessionStore.close(); };
  http = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => http.once("listening", resolve));
  const address = http.address();
  if (!address || typeof address === "string") throw new Error("Missing test server address");
  base = `http://127.0.0.1:${address.port}/api`;
});

afterAll(async () => {
  if (!databaseUrl) return;
  if (http) await new Promise<void>((resolve, reject) => http.close((err) => err ? reject(err) : resolve()));
  if (closeStore) await closeStore();
  if (db) await db.$disconnect();
  if (admin) { await admin.query(`DROP SCHEMA "${schema}" CASCADE`); await admin.end(); }
});

async function request(path: string, method = "GET", body?: unknown, authenticated = true, requestOrigin = origin) {
  return fetch(`${base}${path}`, { method, headers: { "Content-Type": "application/json", Origin: requestOrigin,
    ...(authenticated && cookie ? { Cookie: cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
}

async function fixture() {
  const material = await db.material.create({ data: { name: crypto.randomUUID(), color: "black" } });
  const product = await db.product.create({ data: { name: "Widget", materialId: material.id, estGrams: 10, estPrintMinutes: 60, listPrice: "20" } });
  const printer = await db.printer.create({ data: { name: crypto.randomUUID(), purchaseCost: "1000", lifespanHours: 1000, avgWatts: 100 } });
  await db.setting.upsert({ where: { key: "price_per_kwh" }, create: { key: "price_per_kwh", value: "2" }, update: { value: "2" } });
  return { material, product, printer };
}

integration("HTTP authentication, CSRF, strict validation, logout", async () => {
  expect((await request("/products", "GET", undefined, false)).status).toBe(401);
  expect((await request("/auth/login", "POST", { username: "owner", password: "long-owner-password" }, false, "https://attacker.example")).status).toBe(403);
  expect((await request("/auth/login", "POST", { username: "owner", password: "wrong" }, false)).status).toBe(401);
  const login = await request("/auth/login", "POST", { username: "owner", password: "long-owner-password" }, false);
  expect(login.status).toBe(200);
  cookie = login.headers.get("set-cookie")!.split(";")[0];
  expect(login.headers.get("set-cookie")).toContain("HttpOnly");
  expect(login.headers.get("set-cookie")).toContain("SameSite=Strict");
  expect((await request("/auth/me")).status).toBe(200);
  expect((await request("/materials", "POST", { name: "PLA", color: "white", stockGrams: 100 })).status).toBe(400);
  expect((await request("/materials", "POST", { name: "PLA", color: "white" })).status).toBe(201);
  expect((await request("/products?limit=1000")).status).toBe(400);
  expect((await request("/settings/price_per_kwh", "PUT", { value: "1.5" })).status).toBe(200);
  expect((await request("/auth/logout", "POST", {})).status).toBe(204);
  expect((await request("/auth/me")).status).toBe(401);
});

integration("purchase → production → sale: atomic stock, cost and cash", async () => {
  const { material, product, printer } = await fixture();
  await ops.purchase(db, { materialId: material.id, grams: 1000, totalCost: "100" });
  await ops.purchase(db, { materialId: material.id, grams: 1000, totalCost: "200" });
  expect((await db.material.findUniqueOrThrow({ where: { id: material.id } })).avgCostPerGram.toString()).toBe("0.15");
  const job = await ops.startJob(db, { productId: product.id, printerId: printer.id, qtyPlanned: 3 });
  await db.printJob.update({ where: { id: job.id }, data: { startedAt: new Date(Date.now() - 3600000) } });
  const finished = await ops.finishJob(db, job.id, { qtyGood: 2, qtyFailed: 1, gramsUsed: 100, failureReason: "CLOG" });
  expect(finished.materialCost!.toString()).toBe("15");
  expect(finished.unitCost!.gte("8.1")).toBe(true);
  expect((await db.material.findUniqueOrThrow({ where: { id: material.id } })).stockGrams).toBe(1900);
  await expect(ops.finishJob(db, job.id, { qtyGood: 2, qtyFailed: 1, gramsUsed: 100, failureReason: "CLOG" })).rejects.toThrow("not running");
  const sale = await ops.sell(db, { productId: product.id, qty: 1, unitPrice: "20" });
  expect(sale.unitCogs.toString()).toBe(finished.unitCost!.toString());
  expect(sale.paidAt).toBeNull();
  const payments = await Promise.allSettled([ops.paySale(db, sale.id, "CASH"), ops.paySale(db, sale.id, "CASH")]);
  expect(payments.filter((p) => p.status === "fulfilled")).toHaveLength(1);
  const txn = await db.transaction.findUniqueOrThrow({ where: { saleId: sale.id } });
  expect(txn.amount.toString()).toBe("20");
  expect(txn.affectsPnl).toBe(false);
  await expect(ops.voidRecord(db, "sales", sale.id, "refund")).rejects.toThrow("refund workflow");
  await expect(ops.voidRecord(db, "jobs", job.id, "wrong entry")).rejects.toThrow("Later stock activity");
});

integration("concurrent job start and sales cannot duplicate a printer or oversell", async () => {
  const { material, product, printer } = await fixture();
  await ops.purchase(db, { materialId: material.id, grams: 100, totalCost: "10" });
  const starts = await Promise.allSettled([ops.startJob(db, { productId: product.id, printerId: printer.id, qtyPlanned: 1 }), ops.startJob(db, { productId: product.id, printerId: printer.id, qtyPlanned: 1 })]);
  expect(starts.filter((p) => p.status === "fulfilled")).toHaveLength(1);
  const job = await db.printJob.findFirstOrThrow({ where: { printerId: printer.id } });
  await db.printJob.update({ where: { id: job.id }, data: { startedAt: new Date(Date.now() - 60000) } });
  await expect(ops.finishJob(db, job.id, { qtyGood: 1, qtyFailed: 0, gramsUsed: 101 })).rejects.toThrow("Insufficient material");
  expect((await db.material.findUniqueOrThrow({ where: { id: material.id } })).stockGrams).toBe(100);
  await ops.finishJob(db, job.id, { qtyGood: 1, qtyFailed: 0, gramsUsed: 10 });
  const sales = await Promise.allSettled([ops.sell(db, { productId: product.id, qty: 1, unitPrice: "20" }), ops.sell(db, { productId: product.id, qty: 1, unitPrice: "20" })]);
  expect(sales.filter((p) => p.status === "fulfilled")).toHaveLength(1);
  const stock = await db.stockMovement.aggregate({ where: { productId: product.id }, _sum: { qty: true } });
  expect(stock._sum.qty).toBe(0);
  const sale = await db.sale.findFirstOrThrow({ where: { productId: product.id } });
  await ops.voidRecord(db, "sales", sale.id, "Entry error");
  expect((await db.stockMovement.aggregate({ where: { productId: product.id }, _sum: { qty: true } }))._sum.qty).toBe(1);
  await expect(ops.voidRecord(db, "sales", sale.id, "again")).rejects.toThrow("already voided");
});

integration("fully failed jobs record non-cash waste; reversal restores material", async () => {
  const { material, product, printer } = await fixture();
  await ops.purchase(db, { materialId: material.id, grams: 100, totalCost: "10" });
  const job = await ops.startJob(db, { productId: product.id, printerId: printer.id, qtyPlanned: 1 });
  await db.printJob.update({ where: { id: job.id }, data: { startedAt: new Date(Date.now() - 60000) } });
  await ops.finishJob(db, job.id, { qtyGood: 0, qtyFailed: 1, gramsUsed: 10, failureReason: "BED_ADHESION" });
  const waste = await db.transaction.findUniqueOrThrow({ where: { printJobId: job.id } });
  expect(waste.kind).toBe("WASTE");
  expect(waste.affectsCash).toBe(false);
  await ops.voidRecord(db, "jobs", job.id, "Entry error");
  expect((await db.material.findUniqueOrThrow({ where: { id: material.id } })).stockGrams).toBe(100);
  expect((await db.transaction.findUniqueOrThrow({ where: { id: waste.id } })).voidedAt).not.toBeNull();
});

integration("purchase, adjustment, maintenance and manual transaction voids", async () => {
  const { material, printer } = await fixture();
  const purchase = await ops.purchase(db, { materialId: material.id, grams: 100, totalCost: "10" });
  await ops.voidRecord(db, "purchases", purchase.id, "Entry error");
  expect((await db.material.findUniqueOrThrow({ where: { id: material.id } })).stockGrams).toBe(0);
  await ops.purchase(db, { materialId: material.id, grams: 100, totalCost: "10" });
  const adjustment = await ops.adjust(db, { materialId: material.id, qtyDelta: -10, reason: "DAMAGED" });
  expect(adjustment.costImpact.toString()).toBe("-1");
  await ops.voidRecord(db, "adjustments", adjustment.id, "Wrong count");
  expect((await db.material.findUniqueOrThrow({ where: { id: material.id } })).stockGrams).toBe(100);
  const service = await ops.maintain(db, { printerId: printer.id, type: "NOZZLE", cost: "20" });
  await ops.voidRecord(db, "maintenance", service.id, "Duplicate" );
  expect((await db.transaction.findUniqueOrThrow({ where: { maintenanceId: service.id } })).voidedAt).not.toBeNull();
  const txn = await ops.manualTransaction(db, { kind: "ELECTRICITY_BILL", amount: "50" });
  expect(txn.affectsPnl).toBe(false);
  await ops.voidRecord(db, "transactions", txn.id, "Duplicate");
  const auto = await db.transaction.findUniqueOrThrow({ where: { materialPurchaseId: purchase.id } });
  await expect(ops.voidRecord(db, "transactions", auto.id, "No")).rejects.toThrow("MANUAL");
});

integration("database rejects invalid rows, deletes and stock ledger edits", async () => {
  const { material } = await fixture();
  await expect(Promise.resolve(db.material.update({ where: { id: material.id }, data: { stockGrams: -1 } }))).rejects.toThrow();
  await expect(Promise.resolve(db.material.delete({ where: { id: material.id } }))).rejects.toThrow();
  await expect(Promise.resolve(db.stockAdjustment.create({ data: { qtyDelta: -1, reason: "LOST", costImpact: "-1" } }))).rejects.toThrow();
  const movement = await db.stockMovement.findFirstOrThrow();
  await expect(Promise.resolve(db.stockMovement.update({ where: { id: movement.id }, data: { qty: 999 } }))).rejects.toThrow();
});

integration("mixed purchase reversal is rejected without changing balances", async () => {
  const { material } = await fixture();
  await ops.purchase(db, { materialId: material.id, grams: 100, totalCost: "10" });
  const second = await ops.purchase(db, { materialId: material.id, grams: 100, totalCost: "20" });
  await expect(ops.voidRecord(db, "purchases", second.id, "Wrong entry")).rejects.toThrow("mixed with earlier stock");
  const current = await db.material.findUniqueOrThrow({ where: { id: material.id } });
  expect(current.stockGrams).toBe(200);
  expect(current.avgCostPerGram.toString()).toBe("0.15");
});

integration("frontend read filters and detail routes expose the correct lifecycle states", async () => {
  const login = await request("/auth/login", "POST", { username: "owner", password: "long-owner-password" }, false);
  expect(login.status).toBe(200);
  cookie = login.headers.get("set-cookie")!.split(";")[0];
  const { material, product, printer } = await fixture();
  await ops.purchase(db, { materialId: material.id, grams: 100, totalCost: "10" });
  const completed = await ops.startJob(db, { productId: product.id, printerId: printer.id, qtyPlanned: 2 });
  await ops.finishJob(db, completed.id, { qtyGood: 2, qtyFailed: 0, gramsUsed: 10 });
  const voided = await ops.startJob(db, { productId: product.id, printerId: printer.id, qtyPlanned: 1 });
  await ops.voidRecord(db, "jobs", voided.id, "Wrong product selected");
  const running = await ops.startJob(db, { productId: product.id, printerId: printer.id, qtyPlanned: 1 });
  const unpaid = await ops.sell(db, { productId: product.id, qty: 1, unitPrice: "20" });
  const paid = await ops.sell(db, { productId: product.id, qty: 1, unitPrice: "20", paymentMethod: "QRIS" });
  const activeJobs = await (await request("/jobs?status=PRINTING&voided=exclude&limit=100")).json();
  expect(activeJobs.some((row: { id: string }) => row.id === running.id)).toBe(true);
  expect(activeJobs.some((row: { id: string }) => row.id === voided.id || row.id === completed.id)).toBe(false);
  const unpaidSales = await (await request("/sales?payment=unpaid&voided=exclude&limit=100")).json();
  expect(unpaidSales.some((row: { id: string }) => row.id === unpaid.id)).toBe(true);
  expect(unpaidSales.some((row: { id: string }) => row.id === paid.id)).toBe(false);
  expect((await (await request(`/jobs/${running.id}`)).json()).id).toBe(running.id);
  expect((await (await request(`/sales/${unpaid.id}`)).json()).id).toBe(unpaid.id);
  expect((await request("/jobs?status=QUEUED")).status).toBe(400);
  expect((await request("/sales?payment=partial")).status).toBe(400);
  expect((await request(`/jobs/${running.id}`, "GET", undefined, false)).status).toBe(401);
});

integration("database login throttle survives process-local limiter state", async () => {
  await db.loginThrottle.upsert({ where: { key: "owner" }, create: { key: "owner", attempts: 20, expiresAt: new Date(Date.now() + 60000) }, update: { attempts: 20, expiresAt: new Date(Date.now() + 60000) } });
  expect((await request("/auth/login", "POST", { username: "owner", password: "long-owner-password" }, false)).status).toBe(429);
});
