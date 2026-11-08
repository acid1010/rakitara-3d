"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { buttonVariants } from "@/components/ui/button";
import type {
  PurchaseRow,
  SaleRow,
  MaintenanceRow,
  AdjustmentRow,
  TransactionRow,
  MovementRow,
} from "@/lib/contracts";
import { dateTime, humanize, money, saleTotal } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useOperations, useList, Loading, ErrorMessage } from "./provider";
import { NoRecords, PageHeading, Pager, Status, VoidButton } from "./common";

export type Column<T> = {
  title: string;
  render: (row: T) => ReactNode;
  numeric?: boolean;
};
export function Records<T extends { id: string }>({
  rows,
  columns,
  emptyTitle = "No records yet",
  emptyDescription = "New records will appear here.",
  emptyHref,
  emptyAction,
}: {
  rows: T[];
  columns: Column<T>[];
  emptyTitle?: string;
  emptyDescription?: string;
  emptyHref?: string;
  emptyAction?: string;
}) {
  if (!rows.length)
    return (
      <NoRecords
        title={emptyTitle}
        description={emptyDescription}
        href={emptyHref}
        action={emptyAction}
      />
    );
  return (
    <Table className="records-table">
      <TableHeader>
        <TableRow>
          {columns.map((column) => (
            <TableHead
              key={column.title}
              className={column.numeric ? "text-right" : undefined}
            >
              {column.title}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            {columns.map((column) => (
              <TableCell
                key={column.title}
                data-label={column.title}
                className={cn(column.numeric && "numeric-cell")}
              >
                {column.render(row)}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function RecordName({
  title,
  detail,
}: {
  title: string;
  detail?: ReactNode;
}) {
  return (
    <div className="record-name">
      <strong>{title}</strong>
      {detail && <span>{detail}</span>}
    </div>
  );
}

export function SectionLinks({
  links,
  active,
}: {
  links: [string, string][];
  active: string;
}) {
  return (
    <nav className="section-links" aria-label="Section views">
      {links.map(([href, label]) => (
        <Link
          href={href}
          key={href}
          aria-current={href === active ? "page" : undefined}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}

const materialLinks: [string, string][] = [
  ["/materials", "Material stock"],
  ["/purchases", "Purchases"],
];
const productLinks: [string, string][] = [
  ["/products", "Products"],
  ["/adjustments", "Adjustments"],
  ["/movements", "Stock movements"],
];
const printerLinks: [string, string][] = [
  ["/printers", "Printers"],
  ["/maintenance", "Maintenance"],
];
const edit = (kind: string, id: string) => (
  <Link
    className={buttonVariants({ variant: "ghost", size: "sm" })}
    href={`/entry/${kind}?id=${id}`}
  >
    Edit
  </Link>
);

export function InventoryPage({
  kind,
}: {
  kind: "materials" | "products" | "printers";
}) {
  const { materials, products, printers, running } = useOperations();
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState("active");
  const materialName = (id: string) => {
    const material = materials.find((row) => row.id === id);
    return material ? `${material.name} / ${material.color}` : id;
  };
  const matches = (row: { name: string; isActive: boolean }, extra = "") =>
    (scope !== "active" || row.isActive) &&
    `${row.name} ${extra}`.toLowerCase().includes(query.toLowerCase());
  const titles = {
    materials: [
      "Materials",
      "Know what’s on the shelf before the next print.",
      "Add material",
      "material",
    ],
    products: [
      "Products & stock",
      "Your designs, their cost, and what’s ready to sell.",
      "Add product",
      "product",
    ],
    printers: [
      "Printers",
      "The machines that keep your studio moving.",
      "Add printer",
      "printer",
    ],
  } as const;
  const [title, description, label, entry] = titles[kind];
  return (
    <>
      <PageHeading
        title={title}
        description={description}
        action={{ href: `/entry/${entry}`, label }}
      />
      <SectionLinks
        links={
          kind === "materials"
            ? materialLinks
            : kind === "products"
              ? productLinks
              : printerLinks
        }
        active={`/${kind}`}
      />
      <div className="list-toolbar">
        <Input
          aria-label={`Search ${kind}`}
          placeholder={`Search ${kind}…`}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <NativeSelect
          aria-label="Record visibility"
          value={scope}
          onChange={(event) => setScope(event.target.value)}
        >
          <NativeSelectOption value="active">Active only</NativeSelectOption>
          <NativeSelectOption value="all">Include inactive</NativeSelectOption>
        </NativeSelect>
      </div>
      <div className="records-panel">
        {kind === "materials" && (
          <Records
            rows={materials.filter((row) => matches(row, row.color))}
            emptyTitle="No matching materials"
            emptyDescription="Add a material, then record a purchase to bring stock into the studio."
            emptyHref="/entry/material"
            emptyAction="Add material"
            columns={[
              {
                title: "Material",
                render: (row) => (
                  <RecordName title={row.name} detail={row.color} />
                ),
              },
              {
                title: "On hand",
                numeric: true,
                render: (row) => (
                  <strong>
                    {row.stockGrams.toLocaleString()}{" "}
                    <span className="unit">g</span>
                  </strong>
                ),
              },
              {
                title: "Average cost / g",
                numeric: true,
                render: (row) => money(row.avgCostPerGram, 4),
              },
              {
                title: "Low-stock threshold",
                numeric: true,
                render: (row) => `${row.lowStockGrams.toLocaleString()} g`,
              },
              {
                title: "Status",
                render: (row) => (
                  <Status
                    tone={
                      !row.isActive
                        ? "neutral"
                        : row.stockGrams <= row.lowStockGrams
                          ? "warning"
                          : "success"
                    }
                  >
                    {!row.isActive
                      ? "Inactive"
                      : row.stockGrams <= row.lowStockGrams
                        ? "Low stock"
                        : "In stock"}
                  </Status>
                ),
              },
              {
                title: "Actions",
                render: (row) => (
                  <div className="row-actions">
                    {row.isActive && (
                      <Link
                        className={buttonVariants({
                          variant: "outline",
                          size: "sm",
                        })}
                        href={`/entry/purchase?materialId=${row.id}`}
                      >
                        Buy material
                      </Link>
                    )}
                    {edit("material", row.id)}
                  </div>
                ),
              },
            ]}
          />
        )}
        {kind === "products" && (
          <Records
            rows={products.filter((row) =>
              matches(row, materialName(row.materialId)),
            )}
            emptyTitle="No matching products"
            emptyDescription="Create a product using an existing material. Finished stock is added when a print job is completed."
            emptyHref="/entry/product"
            emptyAction="Add product"
            columns={[
              {
                title: "Product",
                render: (row) => (
                  <RecordName
                    title={row.name}
                    detail={`${materialName(row.materialId)}${row.isCustom ? " · Custom" : ""}`}
                  />
                ),
              },
              {
                title: "On hand",
                numeric: true,
                render: (row) => (
                  <strong>
                    {row.onHand.toLocaleString()}{" "}
                    <span className="unit">units</span>
                  </strong>
                ),
              },
              {
                title: "Unit HPP",
                numeric: true,
                render: (row) => money(row.avgCost, 4),
              },
              {
                title: "List price",
                numeric: true,
                render: (row) => money(row.listPrice),
              },
              {
                title: "Estimate / unit",
                render: (row) =>
                  `${row.estGrams} g / ${row.estPrintMinutes} min`,
              },
              {
                title: "Status",
                render: (row) => (
                  <Status tone={row.isActive ? "success" : "neutral"}>
                    {row.isActive ? "Active" : "Inactive"}
                  </Status>
                ),
              },
              {
                title: "Actions",
                render: (row) => (
                  <div className="row-actions">
                    {row.isActive && row.onHand > 0 && (
                      <Link
                        href={`/entry/sale?productId=${row.id}`}
                        className={buttonVariants({
                          variant: "outline",
                          size: "sm",
                        })}
                      >
                        Sell
                      </Link>
                    )}
                    {edit("product", row.id)}
                  </div>
                ),
              },
            ]}
          />
        )}
        {kind === "printers" && (
          <Records
            rows={printers.filter((row) => matches(row, row.model ?? ""))}
            emptyTitle="No matching printers"
            emptyDescription="Add your first printer with its purchase cost and power usage to calculate production HPP."
            emptyHref="/entry/printer"
            emptyAction="Add printer"
            columns={[
              {
                title: "Printer",
                render: (row) => (
                  <RecordName
                    title={row.name}
                    detail={row.model ?? "Model not specified"}
                  />
                ),
              },
              {
                title: "Status",
                render: (row) => (
                  <Status
                    tone={
                      !row.isActive
                        ? "neutral"
                        : running.some((job) => job.printerId === row.id)
                          ? "warning"
                          : "success"
                    }
                  >
                    {!row.isActive
                      ? "Inactive"
                      : running.some((job) => job.printerId === row.id)
                        ? "Printing"
                        : "Ready"}
                  </Status>
                ),
              },
              {
                title: "Purchase cost",
                numeric: true,
                render: (row) => money(row.purchaseCost),
              },
              {
                title: "Lifespan",
                numeric: true,
                render: (row) => `${row.lifespanHours.toLocaleString()} h`,
              },
              {
                title: "Average power",
                numeric: true,
                render: (row) => `${row.avgWatts} W`,
              },
              {
                title: "Actions",
                render: (row) => (
                  <div className="row-actions">
                    {row.isActive && (
                      <Link
                        href={`/entry/maintenance?printerId=${row.id}`}
                        className={buttonVariants({
                          variant: "outline",
                          size: "sm",
                        })}
                      >
                        Log maintenance
                      </Link>
                    )}
                    {running.some((job) => job.printerId === row.id) ? (
                      <span className="muted">Finish job to edit</span>
                    ) : (
                      edit("printer", row.id)
                    )}
                  </div>
                ),
              },
            ]}
          />
        )}
      </div>
      <p className="page-note">
        {kind === "materials"
          ? "Material is pooled by name and color. Purchases update its weighted-average cost."
          : kind === "products"
            ? "HPP is the weighted-average cost of finished stock, not the list price. A different material needs a new product."
            : "Adding a printer does not record its cash payment. Record equipment purchases separately in the cash journal."}
      </p>
    </>
  );
}

function History<T extends { id: string }>({
  title,
  description,
  action,
  links,
  active,
  path,
  columns,
  controls,
  note,
}: {
  title: string;
  description: string;
  action?: { href: string; label: string };
  links?: [string, string][];
  active?: string;
  path: string;
  columns: Column<T>[];
  controls?: ReactNode;
  note?: string;
}) {
  const [page, setPage] = useState({ path, offset: 0 });
  const offset = page.path === path ? page.offset : 0;
  const { data, error, retry } = useList<T[]>(
    `${path}${path.includes("?") ? "&" : "?"}limit=25&offset=${offset}`,
  );
  return (
    <>
      <PageHeading title={title} description={description} action={action} />
      {links && <SectionLinks links={links} active={active ?? ""} />}
      {controls && <div className="list-toolbar">{controls}</div>}
      {note && <p className="context-note">{note}</p>}
      {error ? (
        <ErrorMessage message={error} retry={retry} />
      ) : !data ? (
        <Loading label="Loading records…" />
      ) : (
        <div className="records-panel">
          <Records
            rows={data}
            columns={columns}
            emptyTitle="Nothing here yet"
            emptyDescription="Records matching this view will appear here."
            emptyHref={action?.href}
            emptyAction={action?.label}
          />
          <Pager
            offset={offset}
            count={data.length}
            onChange={(value) => setPage({ path, offset: value })}
          />
        </div>
      )}
    </>
  );
}

export function PurchasesPage() {
  const { materials } = useOperations();
  return (
    <History<PurchaseRow>
      title="Materials"
      description="Every purchase, with stock and cash recorded together."
      action={{ href: "/entry/purchase", label: "Record purchase" }}
      links={materialLinks}
      active="/purchases"
      path="/purchases"
      columns={[
        {
          title: "Material",
          render: (row) => {
            const m = materials.find((m) => m.id === row.materialId);
            return (
              <RecordName title={m?.name ?? row.materialId} detail={m?.color} />
            );
          },
        },
        { title: "Purchased", render: (row) => dateTime(row.purchasedAt) },
        {
          title: "Quantity",
          numeric: true,
          render: (row) => `${row.grams.toLocaleString()} g`,
        },
        {
          title: "Total cost",
          numeric: true,
          render: (row) => money(row.totalCost),
        },
        { title: "Supplier", render: (row) => row.supplier ?? "—" },
        {
          title: "Status",
          render: (row) => (
            <Status tone={row.voidedAt ? "neutral" : "success"}>
              {row.voidedAt ? "Voided" : "Recorded"}
            </Status>
          ),
        },
        {
          title: "Correction",
          render: (row) =>
            row.voidedAt ? (
              <span className="muted">{row.voidReason}</span>
            ) : (
              <VoidButton
                resource="purchases"
                id={row.id}
                label={`Purchase of ${row.grams} g`}
              />
            ),
        },
      ]}
    />
  );
}

export function SalesPage() {
  const { products } = useOperations();
  const [filter, setFilter] = useState("active");
  const path =
    filter === "unpaid"
      ? "/sales?payment=unpaid&voided=exclude"
      : filter === "paid"
        ? "/sales?payment=paid&voided=exclude"
        : filter === "voided"
          ? "/sales?voided=only"
          : "/sales?voided=exclude";
  return (
    <History<SaleRow>
      title="Sales"
      description="From finished print to sale. Keep every payment in view."
      action={{ href: "/entry/sale", label: "Record sale" }}
      path={path}
      controls={
        <NativeSelect
          aria-label="Filter sales"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <NativeSelectOption value="active">All sales</NativeSelectOption>
          <NativeSelectOption value="unpaid">
            Awaiting payment
          </NativeSelectOption>
          <NativeSelectOption value="paid">Paid</NativeSelectOption>
          <NativeSelectOption value="voided">Voided</NativeSelectOption>
        </NativeSelect>
      }
      note="Stock leaves the shelf when a sale is recorded, even if payment comes later. Payments are full settlement only."
      columns={[
        {
          title: "Sale",
          render: (row) => (
            <RecordName
              title={
                products.find((p) => p.id === row.productId)?.name ??
                row.productId
              }
              detail={
                <>
                  <span title={row.saleNo}>{row.saleNo.slice(0, 13)}</span> ·{" "}
                  {dateTime(row.soldAt)}
                </>
              }
            />
          ),
        },
        {
          title: "Customer",
          render: (row) => (
            <RecordName
              title={row.customerName ?? "Walk-in customer"}
              detail={row.customerPhone}
            />
          ),
        },
        { title: "Quantity", numeric: true, render: (row) => row.qty },
        {
          title: "Total",
          numeric: true,
          render: (row) => (
            <RecordName
              title={money(saleTotal(row.unitPrice, row.qty))}
              detail={`${money(row.unitPrice)} / unit`}
            />
          ),
        },
        {
          title: "Unit COGS",
          numeric: true,
          render: (row) => money(row.unitCogs, 4),
        },
        {
          title: "Payment",
          render: (row) => (
            <div className="record-name">
              <Status
                tone={
                  row.voidedAt ? "neutral" : row.paidAt ? "success" : "warning"
                }
              >
                {row.voidedAt
                  ? "Voided"
                  : row.paidAt
                    ? "Paid"
                    : "Awaiting payment"}
              </Status>
              {row.paidAt && (
                <span>
                  {row.paymentMethod} · {dateTime(row.paidAt)}
                </span>
              )}
            </div>
          ),
        },
        {
          title: "Actions",
          render: (row) =>
            row.voidedAt ? (
              <span className="muted">{row.voidReason}</span>
            ) : row.paidAt ? (
              <span className="muted">Settled</span>
            ) : (
              <div className="row-actions">
                <Link
                  href={`/entry/payment?id=${row.id}`}
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  Collect payment
                </Link>
                <VoidButton
                  resource="sales"
                  id={row.id}
                  label={`Sale ${row.saleNo}`}
                />
              </div>
            ),
        },
      ]}
    />
  );
}

export function MaintenancePage() {
  const { printers } = useOperations();
  return (
    <History<MaintenanceRow>
      title="Printers"
      description="A clear service history for every machine."
      action={{ href: "/entry/maintenance", label: "Log maintenance" }}
      links={printerLinks}
      active="/maintenance"
      path="/maintenance"
      columns={[
        {
          title: "Printer",
          render: (row) =>
            printers.find((p) => p.id === row.printerId)?.name ?? row.printerId,
        },
        {
          title: "Maintenance",
          render: (row) => (
            <RecordName title={humanize(row.type)} detail={row.notes} />
          ),
        },
        { title: "Performed", render: (row) => dateTime(row.performedAt) },
        { title: "Cost", numeric: true, render: (row) => money(row.cost) },
        {
          title: "Status",
          render: (row) => (
            <Status>{row.voidedAt ? "Voided" : "Recorded"}</Status>
          ),
        },
        {
          title: "Correction",
          render: (row) =>
            row.voidedAt ? (
              <span className="muted">{row.voidReason}</span>
            ) : (
              <VoidButton
                resource="maintenance"
                id={row.id}
                label={`${humanize(row.type)} maintenance`}
              />
            ),
        },
      ]}
    />
  );
}

export function AdjustmentsPage() {
  const { materials, products } = useOperations();
  return (
    <History<AdjustmentRow>
      title="Products & stock"
      description="Explain the difference between the shelf and the system."
      action={{ href: "/entry/adjustment", label: "Adjust stock" }}
      links={productLinks}
      active="/adjustments"
      path="/adjustments"
      note="Only miscounts can increase existing valued stock. Opening stock must come from purchases or production."
      columns={[
        {
          title: "Stock item",
          render: (row) => (
            <RecordName
              title={
                row.productId
                  ? (products.find((p) => p.id === row.productId)?.name ??
                    row.productId)
                  : (materials.find((m) => m.id === row.materialId)?.name ??
                    "Material")
              }
              detail={row.productId ? "Finished product" : "Raw material"}
            />
          ),
        },
        {
          title: "Change",
          numeric: true,
          render: (row) =>
            `${row.qtyDelta > 0 ? "+" : ""}${row.qtyDelta} ${row.productId ? "units" : "g"}`,
        },
        {
          title: "Reason",
          render: (row) => (
            <RecordName title={humanize(row.reason)} detail={row.note} />
          ),
        },
        {
          title: "Value impact",
          numeric: true,
          render: (row) => money(row.costImpact),
        },
        { title: "Recorded", render: (row) => dateTime(row.createdAt) },
        {
          title: "Correction",
          render: (row) =>
            row.voidedAt ? (
              <RecordName title="Voided" detail={row.voidReason} />
            ) : (
              <VoidButton
                resource="adjustments"
                id={row.id}
                label="Stock adjustment"
              />
            ),
        },
      ]}
    />
  );
}

export function MovementsPage() {
  const { products } = useOperations();
  const [productId, setProductId] = useState("");
  return (
    <History<MovementRow>
      title="Products & stock"
      description="The permanent trail behind every finished-stock balance."
      links={productLinks}
      active="/movements"
      path={`/stock-movements${productId ? `?productId=${productId}` : ""}`}
      controls={
        <NativeSelect
          aria-label="Filter stock movements by product"
          value={productId}
          onChange={(e) => setProductId(e.target.value)}
        >
          <NativeSelectOption value="">All products</NativeSelectOption>
          {products.map((p) => (
            <NativeSelectOption key={p.id} value={p.id}>
              {p.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      }
      note="This ledger is read-only. Reversals add a new entry; original entries are never changed."
      columns={[
        {
          title: "Product",
          render: (row) =>
            products.find((p) => p.id === row.productId)?.name ?? row.productId,
        },
        {
          title: "Movement",
          render: (row) => (
            <RecordName
              title={humanize(row.type)}
              detail={row.isReversal ? "Reversal" : "Original entry"}
            />
          ),
        },
        {
          title: "Quantity",
          numeric: true,
          render: (row) => `${row.qty > 0 ? "+" : ""}${row.qty}`,
        },
        {
          title: "Unit cost",
          numeric: true,
          render: (row) => money(row.unitCost, 4),
        },
        { title: "Recorded", render: (row) => dateTime(row.createdAt) },
      ]}
    />
  );
}

export function JournalPage() {
  return (
    <History<TransactionRow>
      title="Cash journal"
      description="Money in, money out, and the source of every entry."
      action={{ href: "/entry/transaction", label: "Record transaction" }}
      path="/transactions"
      note="Not a profit report. Non-cash entries do not move cash; sale payments do not count as revenue a second time. Automatic entries are corrected at their source."
      columns={[
        {
          title: "Transaction",
          render: (row) => (
            <RecordName
              title={humanize(row.kind)}
              detail={row.category ?? row.note}
            />
          ),
        },
        { title: "Occurred", render: (row) => dateTime(row.occurredAt) },
        {
          title: "Amount",
          numeric: true,
          render: (row) => (
            <span className={row.voidedAt ? "voided-value" : undefined}>
              {row.direction === "IN" ? "+" : "−"}
              {money(row.amount)}
            </span>
          ),
        },
        {
          title: "Treatment",
          render: (row) => (
            <RecordName
              title={row.affectsCash ? "Cash" : "Non-cash"}
              detail={
                row.affectsPnl
                  ? "Affects profit / loss"
                  : "No direct P&L effect"
              }
            />
          ),
        },
        {
          title: "Source",
          render: (row) => (
            <Status>{row.source === "AUTO" ? "Automatic" : "Manual"}</Status>
          ),
        },
        {
          title: "Correction",
          render: (row) =>
            row.voidedAt ? (
              <RecordName title="Voided" detail={row.voidReason} />
            ) : row.source === "MANUAL" ? (
              <VoidButton
                resource="transactions"
                id={row.id}
                label={`${humanize(row.kind)} transaction`}
              />
            ) : (
              <Link
                className="text-link"
                href={
                  row.saleId
                    ? "/sales"
                    : row.materialPurchaseId
                      ? "/purchases"
                      : row.printJobId
                        ? "/"
                        : row.maintenanceId
                          ? "/maintenance"
                          : "/adjustments"
                }
              >
                View source
              </Link>
            ),
        },
      ]}
    />
  );
}
