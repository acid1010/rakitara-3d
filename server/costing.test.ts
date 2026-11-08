import { expect, test } from "bun:test";
import { Prisma } from "@prisma/client";
import { average, jobCosts } from "./costing.ts";
import { hashPassword, verifyPassword } from "./password.ts";
import { adjustmentInput, money, purchaseInput, saleInput } from "./validation.ts";
import { readConfig } from "./config.ts";

test("moving average and job cost use decimals; failures are absorbed into good units", () => {
  expect(average(1000, new Prisma.Decimal("0.1"), 1000, new Prisma.Decimal("0.2")).toString()).toBe("0.15");
  const costs = jobCosts({ gramsUsed: 100, avgCostPerGram: new Prisma.Decimal("0.15"), durationMs: 3600000,
    purchaseCost: new Prisma.Decimal("1000"), lifespanHours: 1000, avgWatts: 100,
    pricePerKwh: new Prisma.Decimal("2"), qtyGood: 2 });
  expect(costs.materialCost.toString()).toBe("15");
  expect(costs.machineCost.toString()).toBe("1");
  expect(costs.energyCost.toString()).toBe("0.2");
  expect(costs.unitCost?.toString()).toBe("8.1");
  expect(jobCosts({ gramsUsed: 1, avgCostPerGram: new Prisma.Decimal(1), durationMs: 1000,
    purchaseCost: new Prisma.Decimal(0), lifespanHours: 1, avgWatts: 0, pricePerKwh: new Prisma.Decimal(0), qtyGood: 0 }).unitCost).toBeNull();
});

test("reject untrusted decimals, excess fields, invalid adjustment targets", () => {
  for (const value of [1, "-1", "1e2", "0.001", "1000000000000", "NaN"]) expect(money.safeParse(value).success).toBe(false);
  expect(purchaseInput.safeParse({ materialId: crypto.randomUUID(), grams: 1.5, totalCost: "1" }).success).toBe(false);
  expect(saleInput.safeParse({ productId: crypto.randomUUID(), qty: 1, unitPrice: "1", unitCogs: "0" }).success).toBe(false);
  expect(adjustmentInput.safeParse({ qtyDelta: -1, reason: "LOST" }).success).toBe(false);
  expect(adjustmentInput.safeParse({ productId: crypto.randomUUID(), qtyDelta: 1, reason: "GIFTED" }).success).toBe(false);
});

test("password hashing rejects wrong passwords", async () => {
  const encoded = await hashPassword("a-long-owner-password");
  expect(await verifyPassword("a-long-owner-password", encoded)).toBe(true);
  expect(await verifyPassword("wrong", encoded)).toBe(false);
});

test("production refuses insecure origins and missing credentials", () => {
  expect(() => readConfig({})).toThrow();
  expect(() => readConfig({ NODE_ENV: "production", DATABASE_URL: "postgresql://localhost/test", APP_ORIGIN: "http://example.com",
    SESSION_SECRET: "s".repeat(32), ADMIN_USERNAME: "owner", ADMIN_PASSWORD_HASH: `scrypt$${"a".repeat(32)}$${"b".repeat(128)}` })).toThrow("HTTPS");
});
