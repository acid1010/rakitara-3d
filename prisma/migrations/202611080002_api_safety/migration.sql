ALTER TABLE "MaintenanceLog" ADD COLUMN "voidedAt" TIMESTAMP(3), ADD COLUMN "voidReason" TEXT;
CREATE TABLE "session" ("sid" VARCHAR PRIMARY KEY, "sess" JSON NOT NULL, "expire" TIMESTAMP(6) NOT NULL);
CREATE INDEX "session_expire_idx" ON "session"("expire");
CREATE TABLE "LoginThrottle" ("key" TEXT PRIMARY KEY, "attempts" INTEGER NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL);

ALTER TABLE "Printer" ADD CONSTRAINT "Printer_values_check" CHECK ("purchaseCost" >= 0 AND "lifespanHours" > 0 AND "avgWatts" >= 0);
ALTER TABLE "Material" ADD CONSTRAINT "Material_values_check" CHECK ("stockGrams" >= 0 AND "avgCostPerGram" >= 0 AND "lowStockGrams" >= 0);
ALTER TABLE "MaterialPurchase" ADD CONSTRAINT "MaterialPurchase_values_check" CHECK ("grams" > 0 AND "totalCost" > 0);
ALTER TABLE "Product" ADD CONSTRAINT "Product_values_check" CHECK ("estGrams" > 0 AND "estPrintMinutes" > 0 AND "listPrice" >= 0 AND "avgCost" >= 0);
ALTER TABLE "MaintenanceLog" ADD CONSTRAINT "MaintenanceLog_cost_check" CHECK ("cost" IS NULL OR "cost" > 0);
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_values_check" CHECK ("qty" > 0 AND "unitPrice" > 0 AND "unitCogs" >= 0 AND (("paidAt" IS NULL) = ("paymentMethod" IS NULL)));
ALTER TABLE "StockAdjustment" ADD CONSTRAINT "StockAdjustment_target_check" CHECK (num_nonnulls("productId", "materialId") = 1 AND "qtyDelta" <> 0 AND ("qtyDelta" < 0 OR "reason" = 'MISCOUNT') AND "costImpact" * "qtyDelta" >= 0);
ALTER TABLE "PrintJob" ADD CONSTRAINT "PrintJob_values_check" CHECK (
  "qtyPlanned" > 0 AND "qtyGood" >= 0 AND "qtyFailed" >= 0 AND
  (("status" = 'PRINTING' AND "finishedAt" IS NULL AND "gramsUsed" IS NULL AND "qtyGood" = 0 AND "qtyFailed" = 0 AND "materialCost" IS NULL AND "machineCost" IS NULL AND "energyCost" IS NULL AND "unitCost" IS NULL AND "failureReason" IS NULL)
    OR ("status" = 'DONE' AND "finishedAt" IS NOT NULL AND "finishedAt" > "startedAt" AND "gramsUsed" IS NOT NULL AND "gramsUsed" > 0 AND
      "qtyGood"::bigint + "qtyFailed"::bigint = "qtyPlanned" AND "materialCost" IS NOT NULL AND "materialCost" >= 0 AND "machineCost" IS NOT NULL AND "machineCost" >= 0 AND "energyCost" IS NOT NULL AND "energyCost" >= 0 AND
      (("qtyGood" = 0 AND "unitCost" IS NULL) OR ("qtyGood" > 0 AND "unitCost" IS NOT NULL AND "unitCost" >= 0)) AND (("qtyFailed" > 0) = ("failureReason" IS NOT NULL))))
);
CREATE UNIQUE INDEX "PrintJob_one_running_per_printer" ON "PrintJob"("printerId") WHERE "status" = 'PRINTING' AND "voidedAt" IS NULL;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_source_check" CHECK (
  num_nonnulls("printJobId", "saleId", "adjustmentId") = 1 AND "qty" <> 0 AND "unitCost" >= 0 AND
  (("type" = 'PRODUCTION' AND "printJobId" IS NOT NULL AND (("qty" > 0) <> "isReversal")) OR
   ("type" = 'SALE' AND "saleId" IS NOT NULL AND (("qty" < 0) <> "isReversal")) OR
   ("type" = 'ADJUSTMENT' AND "adjustmentId" IS NOT NULL))
);
CREATE UNIQUE INDEX "StockMovement_job_once" ON "StockMovement"("printJobId", "isReversal");
CREATE UNIQUE INDEX "StockMovement_sale_once" ON "StockMovement"("saleId", "isReversal");
CREATE UNIQUE INDEX "StockMovement_adjustment_once" ON "StockMovement"("adjustmentId", "isReversal");
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_source_check" CHECK (
  "amount" > 0 AND
  (("source" = 'AUTO' AND num_nonnulls("saleId", "materialPurchaseId", "printJobId", "adjustmentId", "maintenanceId") = 1 AND "category" IS NULL AND
    (("saleId" IS NOT NULL AND "kind" = 'SALE_PAYMENT' AND "direction" = 'IN' AND "affectsCash" AND NOT "affectsPnl") OR
     ("materialPurchaseId" IS NOT NULL AND "kind" = 'MATERIAL_PURCHASE' AND "direction" = 'OUT' AND "affectsCash" AND NOT "affectsPnl") OR
     ("printJobId" IS NOT NULL AND "kind" = 'WASTE' AND "direction" = 'OUT' AND NOT "affectsCash" AND "affectsPnl") OR
     ("adjustmentId" IS NOT NULL AND "kind" = 'INVENTORY_ADJUSTMENT' AND NOT "affectsCash" AND "affectsPnl") OR
     ("maintenanceId" IS NOT NULL AND "kind" = 'OPEX' AND "direction" = 'OUT' AND "affectsCash" AND "affectsPnl"))) OR
   ("source" = 'MANUAL' AND num_nonnulls("saleId", "materialPurchaseId", "printJobId", "adjustmentId", "maintenanceId") = 0 AND "affectsCash" AND
    (("kind" = 'OWNER_CAPITAL' AND "direction" = 'IN' AND NOT "affectsPnl") OR
     ("kind" IN ('EQUIPMENT_PURCHASE', 'ELECTRICITY_BILL', 'OWNER_DRAW') AND "direction" = 'OUT' AND NOT "affectsPnl") OR
     ("kind" = 'OPEX' AND "direction" = 'OUT' AND "affectsPnl"))))
);
ALTER TABLE "Setting" ADD CONSTRAINT "Setting_price_check" CHECK ("key" <> 'price_per_kwh' OR "value" ~ '^(0|[1-9][0-9]{0,11})(\.[0-9]{1,2})?$');

-- Business records are never deleted. Authentication infrastructure is deliberately excluded.
CREATE FUNCTION reject_business_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Business records must be voided or deactivated, not deleted' USING ERRCODE = '23514'; END;
$$;
DO $$ DECLARE name text; BEGIN
  FOREACH name IN ARRAY ARRAY['Printer','MaintenanceLog','Material','MaterialPurchase','Product','PrintJob','StockMovement','StockAdjustment','Sale','Transaction'] LOOP
    EXECUTE format('CREATE TRIGGER no_delete BEFORE DELETE ON %I FOR EACH ROW EXECUTE FUNCTION reject_business_delete()', name);
    IF name IN ('MaintenanceLog','MaterialPurchase','PrintJob','StockAdjustment','Sale','Transaction') THEN
      EXECUTE format('ALTER TABLE %I ADD CONSTRAINT void_reason_check CHECK (("voidedAt" IS NULL AND "voidReason" IS NULL) OR ("voidedAt" IS NOT NULL AND "voidReason" IS NOT NULL AND length(trim("voidReason")) > 0))', name);
    END IF;
  END LOOP;
END $$;
CREATE FUNCTION reject_stock_edit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Stock movements are append-only; insert a reversal' USING ERRCODE = '23514'; END;
$$;
CREATE TRIGGER no_update BEFORE UPDATE ON "StockMovement" FOR EACH ROW EXECUTE FUNCTION reject_stock_edit();
