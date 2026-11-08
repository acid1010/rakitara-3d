import type {
  Prisma,
  Printer,
  Material,
  Product,
  PrintJob,
  Sale,
  MaterialPurchase,
  StockAdjustment,
  MaintenanceLog,
  Transaction,
  StockMovement,
  Setting,
} from "@prisma/client";

// Match Express JSON serialization without importing Prisma into the browser.
type JsonRow<T> = {
  [K in keyof T]: T[K] extends Date | Prisma.Decimal
    ? string
    : T[K] extends Date | Prisma.Decimal | null
      ? string | null
      : T[K];
};
export type PrinterRow = JsonRow<Printer>;
export type MaterialRow = JsonRow<Material>;
export type ProductRow = JsonRow<Product> & { onHand: number };
export type JobRow = JsonRow<PrintJob>;
export type SaleRow = JsonRow<Sale>;
export type PurchaseRow = JsonRow<MaterialPurchase>;
export type AdjustmentRow = JsonRow<StockAdjustment>;
export type MaintenanceRow = JsonRow<MaintenanceLog>;
export type TransactionRow = JsonRow<Transaction>;
export type MovementRow = JsonRow<StockMovement>;
export type SettingRow = Setting;

export const sections = [
  { path: "/", label: "Production", icon: "production" },
  { path: "/materials", label: "Materials", icon: "materials" },
  { path: "/products", label: "Products & stock", icon: "products" },
  { path: "/sales", label: "Sales", icon: "sales" },
  { path: "/printers", label: "Printers", icon: "printers" },
  { path: "/journal", label: "Cash journal", icon: "journal" },
  { path: "/settings", label: "Settings", icon: "settings" },
] as const;
