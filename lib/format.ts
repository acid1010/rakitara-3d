export function money(value: string | null | undefined, precision = 2): string {
  if (value == null) return "—";
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value);
  if (!match) return "—";
  const [, sign, whole, fraction = ""] = match;
  const padded = fraction.padEnd(precision + 1, "0");
  let scaled =
    BigInt(whole) * BigInt(10) ** BigInt(precision) +
    BigInt(padded.slice(0, precision) || "0");
  if (Number(padded[precision]) >= 5) scaled += BigInt(1);
  const digits = scaled.toString().padStart(precision + 1, "0");
  const integer = precision ? digits.slice(0, -precision) : digits;
  const decimals = precision ? digits.slice(-precision).replace(/0+$/, "") : "";
  return `${sign}Rp ${BigInt(integer).toLocaleString("id-ID")}${decimals ? `,${decimals}` : ""}`;
}

export function saleTotal(unitPrice: string, qty: number): string {
  if (
    !/^(0|[1-9]\d{0,11})(\.\d{1,2})?$/.test(unitPrice) ||
    !Number.isSafeInteger(qty) ||
    qty < 0
  )
    return "0";
  const [whole, fraction = ""] = unitPrice.split(".");
  const cents =
    (BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, "0"))) *
    BigInt(qty);
  const text = cents.toString().padStart(3, "0");
  return `${text.slice(0, -2)}.${text.slice(-2)}`;
}

export function dateTime(value: string | null | undefined): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function elapsed(start: string, now: number): string {
  const minutes = Math.max(
    0,
    Math.floor((now - new Date(start).getTime()) / 60000),
  );
  return minutes < 60
    ? `${minutes}m`
    : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export function humanize(value: string): string {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^./, (letter) => letter.toUpperCase());
}

export function wibToIso(value: string): string {
  return new Date(`${value}:00+07:00`).toISOString();
}
