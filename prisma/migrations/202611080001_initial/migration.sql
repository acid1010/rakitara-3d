CREATE TYPE "PrintJobStatus" AS ENUM ('PRINTING', 'DONE');
CREATE TYPE "FailureReason" AS ENUM ('BED_ADHESION', 'SPAGHETTI', 'CLOG', 'FILAMENT_RUNOUT', 'LAYER_SHIFT', 'POWER_LOSS', 'OTHER');
CREATE TYPE "MaintenanceType" AS ENUM ('NOZZLE', 'BED', 'BELT', 'CALIBRATION', 'REPAIR', 'OTHER');
CREATE TYPE "StockMovementType" AS ENUM ('PRODUCTION', 'SALE', 'ADJUSTMENT');
CREATE TYPE "AdjustmentReason" AS ENUM ('MISCOUNT', 'DAMAGED', 'SAMPLE', 'GIFTED', 'LOST');
CREATE TYPE "PaymentMethod" AS ENUM ('TRANSFER', 'QRIS', 'CASH');
CREATE TYPE "CashDirection" AS ENUM ('IN', 'OUT');
CREATE TYPE "TxnKind" AS ENUM ('SALE_PAYMENT', 'MATERIAL_PURCHASE', 'EQUIPMENT_PURCHASE', 'ELECTRICITY_BILL', 'OPEX', 'WASTE', 'INVENTORY_ADJUSTMENT', 'OWNER_CAPITAL', 'OWNER_DRAW');
CREATE TYPE "TxnSource" AS ENUM ('AUTO', 'MANUAL');

CREATE TABLE "Printer" (
  "id" TEXT PRIMARY KEY, "name" TEXT NOT NULL, "model" TEXT, "purchaseCost" DECIMAL(14,2) NOT NULL,
  "lifespanHours" INTEGER NOT NULL, "avgWatts" INTEGER NOT NULL, "purchasedAt" DATE,
  "isActive" BOOLEAN NOT NULL DEFAULT true, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "MaintenanceLog" (
  "id" TEXT PRIMARY KEY, "printerId" TEXT NOT NULL, "type" "MaintenanceType" NOT NULL, "notes" TEXT,
  "cost" DECIMAL(14,2), "performedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "Material" (
  "id" TEXT PRIMARY KEY, "name" TEXT NOT NULL, "color" TEXT NOT NULL, "stockGrams" INTEGER NOT NULL DEFAULT 0,
  "avgCostPerGram" DECIMAL(12,4) NOT NULL DEFAULT 0, "lowStockGrams" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "MaterialPurchase" (
  "id" TEXT PRIMARY KEY, "materialId" TEXT NOT NULL, "grams" INTEGER NOT NULL, "totalCost" DECIMAL(14,2) NOT NULL,
  "supplier" TEXT, "purchasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "voidedAt" TIMESTAMP(3),
  "voidReason" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "Product" (
  "id" TEXT PRIMARY KEY, "name" TEXT NOT NULL, "materialId" TEXT NOT NULL, "estGrams" INTEGER NOT NULL,
  "estPrintMinutes" INTEGER NOT NULL, "listPrice" DECIMAL(14,2) NOT NULL, "avgCost" DECIMAL(14,4) NOT NULL DEFAULT 0,
  "isCustom" BOOLEAN NOT NULL DEFAULT false, "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "PrintJob" (
  "id" TEXT PRIMARY KEY, "productId" TEXT NOT NULL, "printerId" TEXT NOT NULL, "materialId" TEXT NOT NULL,
  "status" "PrintJobStatus" NOT NULL DEFAULT 'PRINTING', "startedAt" TIMESTAMP(3) NOT NULL, "finishedAt" TIMESTAMP(3),
  "qtyPlanned" INTEGER NOT NULL, "qtyGood" INTEGER NOT NULL DEFAULT 0, "qtyFailed" INTEGER NOT NULL DEFAULT 0,
  "gramsUsed" INTEGER, "materialCost" DECIMAL(14,4), "machineCost" DECIMAL(14,4), "energyCost" DECIMAL(14,4),
  "unitCost" DECIMAL(14,4), "failureReason" "FailureReason", "note" TEXT, "voidedAt" TIMESTAMP(3), "voidReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "StockAdjustment" (
  "id" TEXT PRIMARY KEY, "productId" TEXT, "materialId" TEXT, "qtyDelta" INTEGER NOT NULL,
  "reason" "AdjustmentReason" NOT NULL, "costImpact" DECIMAL(14,2) NOT NULL, "note" TEXT,
  "voidedAt" TIMESTAMP(3), "voidReason" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "Sale" (
  "id" TEXT PRIMARY KEY, "saleNo" TEXT NOT NULL, "productId" TEXT NOT NULL, "qty" INTEGER NOT NULL,
  "unitPrice" DECIMAL(14,2) NOT NULL, "unitCogs" DECIMAL(14,4) NOT NULL, "customerName" TEXT,
  "customerPhone" TEXT, "soldAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "paidAt" TIMESTAMP(3),
  "paymentMethod" "PaymentMethod", "voidedAt" TIMESTAMP(3), "voidReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "StockMovement" (
  "id" TEXT PRIMARY KEY, "productId" TEXT NOT NULL, "type" "StockMovementType" NOT NULL, "qty" INTEGER NOT NULL,
  "unitCost" DECIMAL(14,4) NOT NULL, "isReversal" BOOLEAN NOT NULL DEFAULT false,
  "printJobId" TEXT, "saleId" TEXT, "adjustmentId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "Transaction" (
  "id" TEXT PRIMARY KEY, "occurredAt" TIMESTAMP(3) NOT NULL, "direction" "CashDirection" NOT NULL,
  "kind" "TxnKind" NOT NULL, "amount" DECIMAL(14,2) NOT NULL, "affectsCash" BOOLEAN NOT NULL,
  "affectsPnl" BOOLEAN NOT NULL, "source" "TxnSource" NOT NULL, "category" TEXT,
  "saleId" TEXT, "materialPurchaseId" TEXT, "printJobId" TEXT, "adjustmentId" TEXT, "maintenanceId" TEXT,
  "note" TEXT, "voidedAt" TIMESTAMP(3), "voidReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "Setting" ("key" TEXT PRIMARY KEY, "value" TEXT NOT NULL);

CREATE UNIQUE INDEX "Printer_name_key" ON "Printer"("name");
CREATE INDEX "MaintenanceLog_printerId_idx" ON "MaintenanceLog"("printerId");
CREATE UNIQUE INDEX "Material_name_color_key" ON "Material"("name", "color");
CREATE INDEX "MaterialPurchase_materialId_idx" ON "MaterialPurchase"("materialId");
CREATE INDEX "Product_isActive_idx" ON "Product"("isActive");
CREATE INDEX "PrintJob_printerId_status_idx" ON "PrintJob"("printerId", "status");
CREATE INDEX "PrintJob_productId_idx" ON "PrintJob"("productId");
CREATE INDEX "StockMovement_productId_idx" ON "StockMovement"("productId");
CREATE INDEX "StockMovement_printJobId_idx" ON "StockMovement"("printJobId");
CREATE INDEX "StockMovement_saleId_idx" ON "StockMovement"("saleId");
CREATE INDEX "StockMovement_adjustmentId_idx" ON "StockMovement"("adjustmentId");
CREATE INDEX "StockAdjustment_productId_idx" ON "StockAdjustment"("productId");
CREATE INDEX "StockAdjustment_materialId_idx" ON "StockAdjustment"("materialId");
CREATE UNIQUE INDEX "Sale_saleNo_key" ON "Sale"("saleNo");
CREATE INDEX "Sale_productId_idx" ON "Sale"("productId");
CREATE INDEX "Sale_soldAt_idx" ON "Sale"("soldAt");
CREATE INDEX "Sale_paidAt_idx" ON "Sale"("paidAt");
CREATE UNIQUE INDEX "Transaction_saleId_key" ON "Transaction"("saleId");
CREATE UNIQUE INDEX "Transaction_materialPurchaseId_key" ON "Transaction"("materialPurchaseId");
CREATE UNIQUE INDEX "Transaction_printJobId_key" ON "Transaction"("printJobId");
CREATE UNIQUE INDEX "Transaction_adjustmentId_key" ON "Transaction"("adjustmentId");
CREATE UNIQUE INDEX "Transaction_maintenanceId_key" ON "Transaction"("maintenanceId");
CREATE INDEX "Transaction_occurredAt_idx" ON "Transaction"("occurredAt");
CREATE INDEX "Transaction_kind_idx" ON "Transaction"("kind");

ALTER TABLE "MaintenanceLog" ADD CONSTRAINT "MaintenanceLog_printerId_fkey" FOREIGN KEY ("printerId") REFERENCES "Printer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MaterialPurchase" ADD CONSTRAINT "MaterialPurchase_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Product" ADD CONSTRAINT "Product_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PrintJob" ADD CONSTRAINT "PrintJob_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PrintJob" ADD CONSTRAINT "PrintJob_printerId_fkey" FOREIGN KEY ("printerId") REFERENCES "Printer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PrintJob" ADD CONSTRAINT "PrintJob_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_printJobId_fkey" FOREIGN KEY ("printJobId") REFERENCES "PrintJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_adjustmentId_fkey" FOREIGN KEY ("adjustmentId") REFERENCES "StockAdjustment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockAdjustment" ADD CONSTRAINT "StockAdjustment_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockAdjustment" ADD CONSTRAINT "StockAdjustment_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_materialPurchaseId_fkey" FOREIGN KEY ("materialPurchaseId") REFERENCES "MaterialPurchase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_printJobId_fkey" FOREIGN KEY ("printJobId") REFERENCES "PrintJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_adjustmentId_fkey" FOREIGN KEY ("adjustmentId") REFERENCES "StockAdjustment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_maintenanceId_fkey" FOREIGN KEY ("maintenanceId") REFERENCES "MaintenanceLog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
