import { afterEach, expect, mock, spyOn, test } from "bun:test";
import { api, allRows, ApiError } from "../lib/api";
import { entryBody, type EntryField } from "../lib/entry";
import { dateTime, elapsed, money, saleTotal, wibToIso } from "../lib/format";
import { jobListInput, saleListInput } from "../server/validation";

afterEach(() => mock.restore());

test("IDR formatting and sale arithmetic preserve decimal precision", () => {
  expect(money("12345678901234.995")).toBe("Rp 12.345.678.901.235");
  expect(money("0.12345", 4)).toBe("Rp 0,1235");
  expect(money("-20.25")).toBe("-Rp 20,25");
  expect(money(null)).toBe("—");
  expect(money("1000", 0)).toBe("Rp 1.000");
  expect(saleTotal("999999999999.99", 2147483647)).toBe(
    "2147483646999978525163.53",
  );
  expect(saleTotal("0.10", 3)).toBe("0.30");
  expect(saleTotal("1e4", 3)).toBe("0");
});

test("operating dates use WIB independent of the browser timezone", () => {
  expect(wibToIso("2026-11-08T10:30")).toBe("2026-11-08T03:30:00.000Z");
  expect(dateTime("2026-11-08T03:30:00Z")).toContain("10:30");
  expect(
    elapsed("2026-11-08T03:00:00Z", Date.parse("2026-11-08T04:35:00Z")),
  ).toBe("1h 35m");
});

test("forms send integers, decimal strings, booleans and nullable fields correctly", () => {
  const fields: EntryField[] = [
    { name: "name", label: "Name", required: true },
    { name: "purchaseCost", label: "Cost", type: "money" },
    { name: "avgWatts", label: "Power", type: "number", required: true },
    { name: "model", label: "Model", nullable: true },
    { name: "isActive", label: "Active", type: "boolean" },
  ];
  expect(
    entryBody(
      fields,
      {
        name: " Printer ",
        purchaseCost: "10.20",
        avgWatts: "100",
        model: "",
        isActive: "false",
      },
      "printer",
    ),
  ).toEqual({
    name: "Printer",
    purchaseCost: "10.20",
    avgWatts: 100,
    model: null,
    isActive: false,
  });
  expect(() =>
    entryBody(fields, { name: "Printer", avgWatts: "1.5" }, "printer"),
  ).toThrow("whole number");
  expect(() =>
    entryBody(
      fields,
      { name: "Printer", purchaseCost: "1e5", avgWatts: "1" },
      "printer",
    ),
  ).toThrow("decimal amount");
});

test("adjustments have exactly one target and increases require miscount", () => {
  const fields: EntryField[] = [
    { name: "stockTarget", label: "Stock", required: true },
    { name: "qtyDelta", label: "Change", type: "number", min: -2147483647 },
    { name: "reason", label: "Reason" },
  ];
  expect(
    entryBody(
      fields,
      { stockTarget: "material:abc", qtyDelta: "-5", reason: "DAMAGED" },
      "adjustment",
    ),
  ).toEqual({ materialId: "abc", qtyDelta: -5, reason: "DAMAGED" });
  expect(() =>
    entryBody(
      fields,
      { stockTarget: "product:abc", qtyDelta: "5", reason: "GIFTED" },
      "adjustment",
    ),
  ).toThrow("miscounts");
  expect(() =>
    entryBody(
      fields,
      { stockTarget: "product:abc", qtyDelta: "0", reason: "MISCOUNT" },
      "adjustment",
    ),
  ).toThrow("zero");
});

test("finish forms require a failure reason only for failed units", () => {
  const fields: EntryField[] = [
    { name: "qtyFailed", label: "Failures", type: "number" },
    { name: "failureReason", label: "Reason" },
  ];
  expect(() => entryBody(fields, { qtyFailed: "1" }, "finish")).toThrow(
    "failure reason",
  );
  expect(
    entryBody(fields, { qtyFailed: "0", failureReason: "CLOG" }, "finish"),
  ).toEqual({ qtyFailed: 0 });
});

test("API client sends same-origin JSON and handles logout without parsing an empty body", async () => {
  const request = spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(null, { status: 204 }),
  );
  await api("/auth/logout", { method: "POST", body: {} });
  expect(request).toHaveBeenCalledTimes(1);
  expect(request.mock.calls[0][0]).toBe("/api/auth/logout");
  expect(request.mock.calls[0][1]).toMatchObject({
    credentials: "same-origin",
    method: "POST",
    body: "{}",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
  });
});

test("ambiguous writes never retry and carry an explicit uncertainty flag", async () => {
  const request = spyOn(globalThis, "fetch").mockRejectedValue(
    new TypeError("offline"),
  );
  const error = await api("/purchases", {
    method: "POST",
    body: { grams: 10 },
  }).catch((e) => e);
  expect(error).toBeInstanceOf(ApiError);
  if (!(error instanceof ApiError)) throw new Error("Expected an API error");
  expect(error.uncertain).toBe(true);
  expect(error.message).toContain("Check the records");
  expect(request).toHaveBeenCalledTimes(1);
});

test("validation errors keep field paths; unexpected write responses remain uncertain", async () => {
  const request = spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(
      Response.json(
        {
          error: "Invalid input",
          details: [{ path: ["grams"], message: "Must be positive" }],
        },
        { status: 400 },
      ),
    )
    .mockResolvedValueOnce(new Response("upstream failed", { status: 502 }));
  const invalid = await api("/purchases", { method: "POST" }).catch((e) => e);
  if (!(invalid instanceof ApiError)) throw new Error("Expected an API error");
  expect(invalid.details[0].path).toEqual(["grams"]);
  expect(invalid.uncertain).toBe(false);
  const interrupted = await api("/sales", { method: "POST" }).catch((e) => e);
  if (!(interrupted instanceof ApiError))
    throw new Error("Expected an API error");
  expect(interrupted.uncertain).toBe(true);
  expect(request).toHaveBeenCalledTimes(2);
});

test("reference lists include records after the first 100", async () => {
  const request = spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(
      Response.json(Array.from({ length: 100 }, (_, id) => ({ id }))),
    )
    .mockResolvedValueOnce(Response.json([{ id: 100 }]));
  expect(await allRows("/jobs?status=PRINTING&voided=exclude")).toHaveLength(
    101,
  );
  expect(request.mock.calls[1][0]).toContain("&limit=100&offset=100");
});

test("API read filters are strict and remain backwards compatible", () => {
  expect(
    jobListInput.parse({ status: "PRINTING", voided: "exclude" }),
  ).toMatchObject({
    status: "PRINTING",
    voided: "exclude",
    offset: 0,
    limit: 50,
  });
  expect(
    saleListInput.parse({ payment: "unpaid", voided: "exclude" }),
  ).toMatchObject({ payment: "unpaid", voided: "exclude" });
  expect(jobListInput.parse({})).toMatchObject({ voided: "include" });
  expect(() => saleListInput.parse({ payment: "partial" })).toThrow();
});
