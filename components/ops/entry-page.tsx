"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import {
  RiArrowLeftLine,
  RiCheckLine,
  RiInformationLine,
} from "@remixicon/react";
import { ApiError, api } from "@/lib/api";
import {
  entryBody,
  entryKinds,
  type EntryKind,
  type EntryField,
  type Option,
} from "@/lib/entry";
import { humanize, money, saleTotal } from "@/lib/format";
import type { JobRow, SaleRow } from "@/lib/contracts";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldDescription,
  FieldError,
} from "@/components/ui/field";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Button, buttonVariants } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useOperations, useList, Loading, ErrorMessage } from "./provider";
import { PageHeading, NoRecords } from "./common";

const meta: Record<
  EntryKind,
  {
    title: string;
    description: string;
    endpoint: string;
    back: string;
    save: string;
  }
> = {
  material: {
    title: "Add material",
    description:
      "Create a material and color combination. Record a purchase to add stock.",
    endpoint: "/materials",
    back: "/materials",
    save: "Add material",
  },
  printer: {
    title: "Add printer",
    description:
      "Set the machine’s cost and power usage for production costing.",
    endpoint: "/printers",
    back: "/printers",
    save: "Add printer",
  },
  product: {
    title: "Add product",
    description:
      "Give this design a material, a production estimate, and a selling price.",
    endpoint: "/products",
    back: "/products",
    save: "Add product",
  },
  purchase: {
    title: "Record material purchase",
    description: "Add material stock and record its cash payment together.",
    endpoint: "/purchases",
    back: "/purchases",
    save: "Record purchase",
  },
  job: {
    title: "Start print job",
    description:
      "Choose a product and an available printer. The clock starts when you save.",
    endpoint: "/jobs",
    back: "/",
    save: "Start print job",
  },
  finish: {
    title: "Finish print job",
    description:
      "Record actual output and material use. The API calculates the final HPP.",
    endpoint: "/jobs",
    back: "/",
    save: "Finish job",
  },
  sale: {
    title: "Record sale",
    description:
      "Finished stock is deducted immediately, whether paid now or later.",
    endpoint: "/sales",
    back: "/sales",
    save: "Record sale",
  },
  payment: {
    title: "Collect payment",
    description:
      "Record full settlement of this sale. Partial payments are not supported.",
    endpoint: "/sales",
    back: "/sales",
    save: "Record payment",
  },
  adjustment: {
    title: "Adjust stock",
    description:
      "Record a physical stock difference and explain why it happened.",
    endpoint: "/adjustments",
    back: "/adjustments",
    save: "Record adjustment",
  },
  maintenance: {
    title: "Log maintenance",
    description:
      "Keep a service record. A positive cost also records a paid operating expense.",
    endpoint: "/maintenance",
    back: "/maintenance",
    save: "Log maintenance",
  },
  transaction: {
    title: "Record transaction",
    description:
      "Record a cash movement that is not already created by another workflow.",
    endpoint: "/transactions",
    back: "/journal",
    save: "Record transaction",
  },
};

const options = (values: string[]): Option[] =>
  values.map((value) => ({
    value,
    label: value === "QRIS" ? "QRIS" : humanize(value),
  }));
const payments = options(["TRANSFER", "QRIS", "CASH"]);
const note: EntryField = {
  name: "note",
  label: "Note",
  type: "textarea",
  maxLength: 2000,
};
const amountHelp = "IDR, without thousands separators. Use a dot for decimals.";

export function EntryPage({ kind: raw }: { kind: string }) {
  const kind = entryKinds.find((kind) => kind === raw);
  const params = useSearchParams();
  const id = params.get("id");
  if (!kind)
    return (
      <NoRecords
        title="This form doesn’t exist"
        description="Return to your workspace to choose an action."
        href="/"
        action="Back to production"
      />
    );
  if (kind === "finish" || kind === "payment") {
    if (!id)
      return (
        <NoRecords
          title="Choose a record first"
          description="Open a running job or an unpaid sale to continue."
          href={meta[kind].back}
          action="Back to records"
        />
      );
    return <RemoteEntry kind={kind} id={id} />;
  }
  return <EntryEditor key={`${kind}:${id ?? "new"}`} kind={kind} id={id} />;
}

function RemoteEntry({ kind, id }: { kind: "finish" | "payment"; id: string }) {
  const { data, error, retry } = useList<JobRow | SaleRow>(
    `/${kind === "finish" ? "jobs" : "sales"}/${encodeURIComponent(id)}`,
  );
  if (error) return <ErrorMessage message={error} retry={retry} />;
  if (!data) return <Loading />;
  if ("status" in data) {
    if (data.voidedAt || data.status !== "PRINTING")
      return (
        <NoRecords
          title="This job is no longer running"
          description="Refresh production to see its latest status."
          href="/"
          action="Back to production"
        />
      );
    return <EntryEditor kind="finish" id={id} job={data} />;
  }
  if (data.voidedAt || data.paidAt)
    return (
      <NoRecords
        title="This sale is already settled or voided"
        description="Return to sales to see its latest status."
        href="/sales"
        action="Back to sales"
      />
    );
  return <EntryEditor kind="payment" id={id} sale={data} />;
}

function EntryEditor({
  kind,
  id,
  job,
  sale,
}: {
  kind: EntryKind;
  id: string | null;
  job?: JobRow;
  sale?: SaleRow;
}) {
  const { printers, materials, products, running, settings, refresh, notify } =
    useOperations();
  const router = useRouter();
  const params = useSearchParams();
  const formId = useId();
  const editing = !!id && ["material", "product", "printer"].includes(kind);
  const existing = editing
    ? kind === "material"
      ? materials.find((m) => m.id === id)
      : kind === "product"
        ? products.find((p) => p.id === id)
        : printers.find((p) => p.id === id)
    : undefined;
  const materialOptions = materials
    .filter((m) => m.isActive)
    .map((m) => ({
      value: m.id,
      label: `${m.name} / ${m.color} (${m.stockGrams.toLocaleString()} g)`,
    }));
  const productOptions = products
    .filter(
      (p) =>
        p.isActive &&
        (kind !== "job" ||
          materials.some((m) => m.id === p.materialId && m.isActive)) &&
        (kind !== "sale" || p.onHand > 0),
    )
    .map((p) => ({
      value: p.id,
      label: `${p.name}${kind === "sale" ? ` (${p.onHand} available)` : ""}`,
    }));
  const printerOptions = printers
    .filter(
      (p) =>
        p.isActive &&
        (kind !== "job" || !running.some((job) => job.printerId === p.id)),
    )
    .map((p) => ({ value: p.id, label: p.name }));
  const fields: Record<EntryKind, EntryField[]> = {
    material: [
      {
        name: "name",
        label: "Material name",
        required: true,
        help: "For example, PLA Basic or PETG.",
      },
      {
        name: "color",
        label: "Color",
        required: true,
        help: "Use the supplier’s color name, not a hex code.",
      },
      {
        name: "lowStockGrams",
        label: "Low-stock threshold (g)",
        type: "number",
        defaultValue: "0",
      },
    ],
    printer: [
      { name: "name", label: "Printer name", required: true },
      { name: "model", label: "Model", nullable: true },
      {
        name: "purchaseCost",
        label: "Purchase cost (IDR)",
        type: "money",
        required: true,
        help: amountHelp,
      },
      {
        name: "lifespanHours",
        label: "Expected lifespan (hours)",
        type: "number",
        required: true,
        min: 1,
      },
      {
        name: "avgWatts",
        label: "Average power usage (W)",
        type: "number",
        required: true,
        help: "Use measured average consumption when possible, not the power supply rating.",
      },
      {
        name: "purchasedAt",
        label: "Purchase date",
        type: "date",
        nullable: true,
      },
    ],
    product: [
      { name: "name", label: "Product name", required: true },
      ...(!editing
        ? [
            {
              name: "materialId",
              label: "Material",
              type: "select" as const,
              required: true,
              options: materialOptions,
            },
          ]
        : []),
      {
        name: "estGrams",
        label: "Estimated material / unit (g)",
        type: "number",
        min: 1,
        required: true,
      },
      {
        name: "estPrintMinutes",
        label: "Estimated print time / unit (minutes)",
        type: "number",
        min: 1,
        required: true,
      },
      {
        name: "listPrice",
        label: "List price (IDR)",
        type: "money",
        required: true,
        help: amountHelp,
      },
      {
        name: "isCustom",
        label: "Custom product",
        type: "boolean",
        defaultValue: "false",
      },
    ],
    purchase: [
      {
        name: "materialId",
        label: "Material",
        type: "select",
        required: true,
        options: materialOptions,
      },
      {
        name: "grams",
        label: "Purchased quantity (g)",
        type: "number",
        min: 1,
        required: true,
      },
      {
        name: "totalCost",
        label: "Total paid (IDR)",
        type: "money",
        required: true,
        help: amountHelp,
      },
      { name: "supplier", label: "Supplier" },
    ],
    job: [
      {
        name: "productId",
        label: "Product",
        type: "select",
        required: true,
        options: productOptions,
      },
      {
        name: "printerId",
        label: "Printer",
        type: "select",
        required: true,
        options: printerOptions,
      },
      {
        name: "qtyPlanned",
        label: "Planned quantity",
        type: "number",
        min: 1,
        required: true,
        defaultValue: "1",
      },
      note,
    ],
    finish: [
      {
        name: "qtyGood",
        label: "Good units",
        type: "number",
        required: true,
        defaultValue: String(job?.qtyPlanned ?? 0),
      },
      {
        name: "qtyFailed",
        label: "Failed units",
        type: "number",
        required: true,
        defaultValue: "0",
      },
      {
        name: "gramsUsed",
        label: "Actual material used (g)",
        type: "number",
        min: 1,
        required: true,
        help: "Include supports, purge, brim, and failed prints. Use actual weight, not the product estimate.",
      },
      {
        name: "failureReason",
        label: "Failure reason",
        type: "select",
        options: options([
          "BED_ADHESION",
          "SPAGHETTI",
          "CLOG",
          "FILAMENT_RUNOUT",
          "LAYER_SHIFT",
          "POWER_LOSS",
          "OTHER",
        ]),
      },
      note,
    ],
    sale: [
      {
        name: "productId",
        label: "Product",
        type: "select",
        required: true,
        options: productOptions,
      },
      {
        name: "qty",
        label: "Quantity",
        type: "number",
        required: true,
        min: 1,
        defaultValue: "1",
      },
      {
        name: "unitPrice",
        label: "Selling price / unit (IDR)",
        type: "money",
        required: true,
        help: amountHelp,
      },
      { name: "customerName", label: "Customer name" },
      { name: "customerPhone", label: "Customer phone", type: "tel" },
      {
        name: "paymentMethod",
        label: "Payment",
        type: "select",
        options: payments,
        help: "Leave as unpaid if you haven’t received the full payment yet.",
      },
    ],
    payment: [
      {
        name: "paymentMethod",
        label: "Payment method",
        type: "select",
        required: true,
        options: payments,
      },
    ],
    adjustment: [
      {
        name: "stockTarget",
        label: "Stock item",
        type: "select",
        required: true,
        options: [
          ...products.map((p) => ({
            value: `product:${p.id}`,
            label: `Product: ${p.name} (${p.onHand} units)`,
          })),
          ...materials.map((m) => ({
            value: `material:${m.id}`,
            label: `Material: ${m.name} / ${m.color} (${m.stockGrams} g)`,
          })),
        ],
      },
      {
        name: "qtyDelta",
        label: "Stock change",
        type: "number",
        min: -2147483647,
        required: true,
        help: "Signed whole number. For example, −2 removes two units (product) or grams (material).",
      },
      {
        name: "reason",
        label: "Reason",
        type: "select",
        required: true,
        options: options(["MISCOUNT", "DAMAGED", "SAMPLE", "GIFTED", "LOST"]),
      },
      note,
    ],
    maintenance: [
      {
        name: "printerId",
        label: "Printer",
        type: "select",
        required: true,
        options: printerOptions,
      },
      {
        name: "type",
        label: "Maintenance type",
        type: "select",
        required: true,
        options: options([
          "NOZZLE",
          "BED",
          "BELT",
          "CALIBRATION",
          "REPAIR",
          "OTHER",
        ]),
      },
      {
        name: "cost",
        label: "Cost paid (IDR)",
        type: "money",
        help: "Leave empty for maintenance without a cash expense. Otherwise enter a positive amount.",
      },
      { name: "notes", label: "Notes", type: "textarea", maxLength: 2000 },
    ],
    transaction: [
      {
        name: "kind",
        label: "Transaction type",
        type: "select",
        required: true,
        options: options([
          "EQUIPMENT_PURCHASE",
          "ELECTRICITY_BILL",
          "OPEX",
          "OWNER_CAPITAL",
          "OWNER_DRAW",
        ]),
      },
      {
        name: "amount",
        label: "Amount (IDR)",
        type: "money",
        required: true,
        help: amountHelp,
      },
      { name: "category", label: "Category" },
      {
        name: "occurredAt",
        label: "Occurred at (WIB)",
        type: "datetime-local",
        help: "Leave empty for now. Dates entered here are always interpreted as Asia/Jakarta (UTC+7).",
      },
      note,
    ],
  };
  const activeFields = [
    ...fields[kind],
    ...(editing
      ? [
          {
            name: "isActive",
            label: "Active",
            type: "boolean" as const,
            required: true,
            help: "Inactive records remain in history but cannot be used for new operations.",
          },
        ]
      : []),
  ];
  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial = Object.fromEntries(
      activeFields.map((field) => [field.name, field.defaultValue ?? ""]),
    );
    if (existing)
      for (const [key, value] of Object.entries(existing))
        initial[key] = value == null ? "" : String(value);
    if (initial.purchasedAt)
      initial.purchasedAt = initial.purchasedAt.slice(0, 10);
    for (const key of ["materialId", "productId", "printerId"])
      if (params.get(key)) initial[key] = params.get(key)!;
    if (kind === "sale" && initial.productId)
      initial.unitPrice =
        products.find((p) => p.id === initial.productId)?.listPrice ?? "";
    return initial;
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const lock = useRef(false);
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  const info = meta[kind];
  const selectedProduct = products.find((p) => p.id === values.productId);
  const rateSet = settings.some((s) => s.key === "price_per_kwh");
  let blocked: {
    title: string;
    description: string;
    href: string;
    action: string;
  } | null = null;
  if (editing && !existing)
    blocked = {
      title: "Record not found",
      description: "It may have changed since this page was opened.",
      href: info.back,
      action: "Back to records",
    };
  if (
    !editing &&
    (kind === "product" || kind === "purchase") &&
    !materialOptions.length
  )
    blocked = {
      title: "Add an active material first",
      description:
        "Materials give products their costing identity and purchases their stock destination.",
      href: "/entry/material",
      action: "Add material",
    };
  if (kind === "job" && !productOptions.length)
    blocked = {
      title: "Create an active product first",
      description: "A print job needs a product with an active material.",
      href: "/entry/product",
      action: "Add product",
    };
  if (kind === "job" && productOptions.length && !printerOptions.length)
    blocked = {
      title: "No printer is available",
      description:
        "Finish a running job, activate a printer, or add another machine.",
      href: printers.length ? "/" : "/entry/printer",
      action: printers.length ? "Back to production" : "Add printer",
    };
  if (kind === "sale" && !productOptions.length)
    blocked = {
      title: "Nothing is ready to sell yet",
      description:
        "Complete a print job to add finished stock before recording a sale.",
      href: "/",
      action: "Back to production",
    };
  if (kind === "maintenance" && !printerOptions.length)
    blocked = {
      title: "Add an active printer first",
      description: "Maintenance is linked to a printer in your studio.",
      href: "/printers",
      action: "View printers",
    };
  if (kind === "finish" && !rateSet)
    blocked = {
      title: "Set your electricity rate first",
      description:
        "The API needs this rate to calculate the completed job’s HPP.",
      href: "/settings",
      action: "Open settings",
    };
  if (blocked) return <NoRecords {...blocked} />;
  return (
    <>
      <Link href={info.back} className="back-link">
        <RiArrowLeftLine aria-hidden="true" />
        Back to{" "}
        {info.back === "/"
          ? "production"
          : info.back === "/journal"
            ? "cash journal"
            : info.back.slice(1)}
      </Link>
      <PageHeading
        title={editing ? `Edit ${kind}` : info.title}
        description={info.description}
      />
      <div className="entry-layout">
        <section className="entry-panel">
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              if (lock.current || uncertain) return;
              setError(null);
              let body: Record<string, unknown>;
              try {
                body = entryBody(activeFields, values, kind);
                if (
                  kind === "finish" &&
                  Number(body.qtyGood) + Number(body.qtyFailed) !==
                    job?.qtyPlanned
                )
                  throw new Error(
                    `Good + failed units must equal ${job?.qtyPlanned} planned units.`,
                  );
                if (
                  kind === "sale" &&
                  selectedProduct &&
                  Number(body.qty) > selectedProduct.onHand
                )
                  throw new Error(
                    `Only ${selectedProduct.onHand} units are currently available.`,
                  );
              } catch (e) {
                setError(
                  e instanceof Error ? e : new Error("Check the form values."),
                );
                return;
              }
              lock.current = true;
              setPending(true);
              const endpoint =
                kind === "finish"
                  ? `/jobs/${id}/finish`
                  : kind === "payment"
                    ? `/sales/${id}/pay`
                    : `${info.endpoint}${editing ? `/${id}` : ""}`;
              try {
                await api(endpoint, {
                  method: editing ? "PATCH" : "POST",
                  body,
                });
                notify(
                  editing
                    ? "Changes saved."
                    : `${info.save === "Start print job" ? "Print job started" : info.save === "Finish job" ? "Print job completed. HPP and stock updated" : info.save === "Record payment" ? "Payment recorded" : "Record saved"}.`,
                );
                await refresh();
                router.push(info.back);
              } catch (e) {
                setError(
                  e instanceof Error ? e : new Error("Could not save record."),
                );
                setUncertain(e instanceof ApiError && e.uncertain);
                lock.current = false;
                setPending(false);
              }
            }}
          >
            <FieldGroup className="entry-fields">
              {job && (
                <div className="form-record-summary">
                  <strong>
                    {products.find((p) => p.id === job.productId)?.name}
                  </strong>
                  <span>
                    {printers.find((p) => p.id === job.printerId)?.name} ·{" "}
                    {job.qtyPlanned} planned units
                  </span>
                </div>
              )}
              {sale && (
                <div className="form-record-summary">
                  <strong>{money(saleTotal(sale.unitPrice, sale.qty))}</strong>
                  <span>
                    {sale.qty} ×{" "}
                    {products.find((p) => p.id === sale.productId)?.name} ·{" "}
                    {sale.customerName ?? "Walk-in customer"}
                  </span>
                  <span>{sale.saleNo}</span>
                </div>
              )}
              {error && (
                <Alert variant="destructive" ref={errorRef} tabIndex={-1}>
                  <AlertTitle>
                    {uncertain
                      ? "Check before repeating this action"
                      : "Couldn’t save this record"}
                  </AlertTitle>
                  <AlertDescription>
                    {error.message}
                    {uncertain && (
                      <Link href={info.back} className="text-link">
                        Return to records and check the latest entry
                      </Link>
                    )}
                    {error instanceof ApiError &&
                      error.details
                        .filter((detail) => !detail.path.length)
                        .map((detail, i) => (
                          <span key={i}>{detail.message}</span>
                        ))}
                  </AlertDescription>
                </Alert>
              )}
              {activeFields
                .filter(
                  (field) =>
                    field.name !== "failureReason" ||
                    Number(values.qtyFailed) > 0,
                )
                .map((field) => {
                  const issue =
                    error instanceof ApiError
                      ? error.details.find(
                          (detail) => detail.path[0] === field.name,
                        )?.message
                      : undefined;
                  const required =
                    field.required ||
                    (field.name === "failureReason" &&
                      Number(values.qtyFailed) > 0);
                  const common = {
                    id: `${formId}-${field.name}`,
                    name: field.name,
                    value: values[field.name] ?? "",
                    disabled: pending || uncertain,
                    required,
                    "aria-invalid": !!issue,
                    "aria-describedby":
                      field.help || issue
                        ? `${formId}-${field.name}-help`
                        : undefined,
                    onChange: (
                      event: React.ChangeEvent<
                        | HTMLInputElement
                        | HTMLTextAreaElement
                        | HTMLSelectElement
                      >,
                    ) => {
                      const next = event.target.value;
                      setValues((previous) => ({
                        ...previous,
                        [field.name]: next,
                        ...(field.name === "productId" && kind === "sale"
                          ? {
                              unitPrice:
                                products.find((p) => p.id === next)
                                  ?.listPrice ?? "",
                            }
                          : {}),
                      }));
                    },
                  };
                  return (
                    <Field
                      key={field.name}
                      data-invalid={!!issue}
                      data-disabled={pending || uncertain}
                    >
                      <FieldLabel htmlFor={common.id}>
                        {field.label}
                        {!required && field.type !== "boolean" && (
                          <span className="optional-label">Optional</span>
                        )}
                      </FieldLabel>
                      {field.type === "select" || field.type === "boolean" ? (
                        <NativeSelect {...common} className="w-full">
                          <NativeSelectOption value="">
                            {field.name === "paymentMethod" && kind === "sale"
                              ? "Unpaid — collect later"
                              : "Choose an option"}
                          </NativeSelectOption>
                          {(field.type === "boolean"
                            ? [
                                { value: "true", label: "Yes" },
                                { value: "false", label: "No" },
                              ]
                            : (field.options ?? [])
                          ).map((option) => (
                            <NativeSelectOption
                              key={option.value}
                              value={option.value}
                            >
                              {option.label}
                            </NativeSelectOption>
                          ))}
                        </NativeSelect>
                      ) : field.type === "textarea" ? (
                        <Textarea
                          {...common}
                          maxLength={field.maxLength ?? 2000}
                        />
                      ) : (
                        <Input
                          {...common}
                          type={
                            field.type === "money"
                              ? "text"
                              : (field.type ?? "text")
                          }
                          inputMode={
                            field.type === "money"
                              ? "decimal"
                              : field.type === "number"
                                ? "numeric"
                                : undefined
                          }
                          min={
                            field.type === "number"
                              ? (field.min ?? 0)
                              : undefined
                          }
                          max={field.type === "number" ? 2147483647 : undefined}
                          step={field.type === "number" ? 1 : undefined}
                          maxLength={
                            field.type === "money"
                              ? 15
                              : (field.maxLength ?? 200)
                          }
                          autoComplete={field.type === "tel" ? "tel" : "off"}
                          placeholder={
                            field.type === "money" ? "0.00" : undefined
                          }
                        />
                      )}
                      {(field.help || issue) && (
                        <div id={`${common.id}-help`}>
                          {field.help && (
                            <FieldDescription>{field.help}</FieldDescription>
                          )}
                          {issue && <FieldError>{issue}</FieldError>}
                        </div>
                      )}
                    </Field>
                  );
                })}
              {kind === "sale" && (
                <dl className="sale-summary" aria-live="polite">
                  <dt>Sale total</dt>
                  <dd>
                    {money(
                      saleTotal(
                        values.unitPrice ?? "0",
                        Number(values.qty || 0),
                      ),
                    )}
                  </dd>
                </dl>
              )}
              <div className="form-actions">
                <Link
                  href={info.back}
                  className={buttonVariants({ variant: "outline" })}
                  aria-disabled={pending}
                  onClick={(e) => {
                    if (pending) e.preventDefault();
                  }}
                >
                  Cancel
                </Link>
                <Button type="submit" disabled={pending || uncertain}>
                  <RiCheckLine data-icon="inline-start" />
                  {pending ? "Saving…" : editing ? "Save changes" : info.save}
                </Button>
              </div>
            </FieldGroup>
          </form>
        </section>
        <aside className="entry-aside">
          <RiInformationLine aria-hidden="true" />
          <h2>
            {kind === "sale"
              ? "Before you record"
              : kind === "finish"
                ? "From print to stock"
                : "Keep the record clear"}
          </h2>
          {kind === "sale" ? (
            <>
              <p>
                A sale can contain one product. For multiple products, record
                separate sales.
              </p>
              {selectedProduct && (
                <dl className="form-preview">
                  <dt>Available</dt>
                  <dd>{selectedProduct.onHand} units</dd>
                  <dt>Current unit HPP</dt>
                  <dd>{money(selectedProduct.avgCost, 4)}</dd>
                </dl>
              )}
              <p>
                Paid sales cannot be voided. Refunds are not supported by this
                version.
              </p>
            </>
          ) : kind === "finish" ? (
            <>
              <p>
                Good and failed units must add up to the planned batch quantity.
              </p>
              <p>
                Mixed failures are absorbed into the good units’ cost. A
                completely failed batch records waste and creates no finished
                stock.
              </p>
              <p>
                The finish time is now. Stop the job here when printing actually
                ends.
              </p>
            </>
          ) : kind === "job" ? (
            <>
              <p>
                One running job per printer. Material is consumed at completion,
                not reserved at start.
              </p>
              <p>
                There is no machine connection: this records the work you start
                manually.
              </p>
              {!rateSet && (
                <Link className="text-link" href="/settings">
                  Set your electricity rate before finishing
                </Link>
              )}
            </>
          ) : kind === "purchase" ? (
            <>
              <p>
                Purchases are assumed paid. Saving updates material quantity,
                weighted-average cost, and cash out together.
              </p>
              <p>Don’t record the same payment again in the cash journal.</p>
            </>
          ) : kind === "transaction" ? (
            <>
              <p>
                Only owner capital is cash in. Equipment, electricity, operating
                expenses and owner draws are cash out.
              </p>
              <p>
                Electricity bills affect cash only: production already allocates
                energy through HPP.
              </p>
              <p>
                Don’t duplicate automatic sale payments, material purchases or
                maintenance expenses.
              </p>
            </>
          ) : kind === "adjustment" ? (
            <>
              <p>
                Positive corrections require existing stock with a positive
                valuation, and must use the miscount reason.
              </p>
              <p>
                Use purchases or production for opening stock. Voids correct
                recording errors, not physical losses.
              </p>
            </>
          ) : kind === "printer" ? (
            <>
              <p>Printer settings cannot change while a job is running.</p>
              <p>
                Adding a machine does not create an equipment payment. Record
                that separately in the cash journal.
              </p>
            </>
          ) : kind === "product" ? (
            <>
              <p>
                A product’s material is permanent. Create another product for a
                different material.
              </p>
              <p>
                Estimates help with planning. Actual production costs are
                calculated when a job is completed.
              </p>
            </>
          ) : (
            <>
              <p>
                Historical records remain visible. Changes to master data never
                rewrite previous costs.
              </p>
              <p>
                All operational dates are recorded automatically and displayed
                in WIB.
              </p>
            </>
          )}
        </aside>
      </div>
    </>
  );
}
