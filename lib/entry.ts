import { wibToIso } from "./format";

export type EntryKind =
  | "material"
  | "printer"
  | "product"
  | "purchase"
  | "job"
  | "finish"
  | "sale"
  | "payment"
  | "adjustment"
  | "maintenance"
  | "transaction";
export const entryKinds: EntryKind[] = [
  "material",
  "printer",
  "product",
  "purchase",
  "job",
  "finish",
  "sale",
  "payment",
  "adjustment",
  "maintenance",
  "transaction",
];
export type Option = { value: string; label: string };
export type EntryField = {
  name: string;
  label: string;
  type?:
    | "text"
    | "number"
    | "money"
    | "select"
    | "boolean"
    | "date"
    | "datetime-local"
    | "textarea"
    | "tel";
  required?: boolean;
  min?: number;
  maxLength?: number;
  options?: Option[];
  help?: string;
  defaultValue?: string;
  nullable?: boolean;
};

export function entryBody(
  fields: EntryField[],
  values: Record<string, string>,
  kind: EntryKind,
): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const field of fields) {
    const raw = values[field.name] ?? "";
    const value = raw.trim();
    if (!value) {
      if (field.required) throw new Error(`${field.label} is required.`);
      if (field.nullable) body[field.name] = null;
      continue;
    }
    if (field.type === "number") {
      const number = Number(value);
      if (
        !/^-?\d+$/.test(value) ||
        !Number.isSafeInteger(number) ||
        number < (field.min ?? 0) ||
        number > 2147483647
      )
        throw new Error(
          `${field.label} must be a whole number between ${field.min ?? 0} and 2,147,483,647.`,
        );
      body[field.name] = number;
    } else if (field.type === "money") {
      if (!/^(0|[1-9]\d{0,11})(\.\d{1,2})?$/.test(value))
        throw new Error(
          `${field.label}: use a decimal amount, without separators, with at most 12 integer digits and 2 decimal places.`,
        );
      body[field.name] = value;
    } else if (field.type === "boolean") {
      if (value !== "true" && value !== "false")
        throw new Error(`Choose a value for ${field.label}.`);
      body[field.name] = value === "true";
    } else if (field.type === "datetime-local")
      body[field.name] = wibToIso(value);
    else body[field.name] = value;
  }
  if (kind === "adjustment") {
    const [target, id] = String(body.stockTarget).split(":");
    if (!["product", "material"].includes(target) || !id)
      throw new Error("Choose a stock item.");
    delete body.stockTarget;
    body[`${target}Id`] = id;
    if (body.qtyDelta === 0) throw new Error("Stock change cannot be zero.");
    if (Number(body.qtyDelta) > 0 && body.reason !== "MISCOUNT")
      throw new Error("Only miscounts can increase stock.");
  }
  if (kind === "finish") {
    if (Number(body.qtyFailed) > 0 && !body.failureReason)
      throw new Error("Select a failure reason for the failed units.");
    if (Number(body.qtyFailed) === 0) delete body.failureReason;
  }
  return body;
}
