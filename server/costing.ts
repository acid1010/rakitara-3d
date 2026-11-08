import { Prisma } from "@prisma/client";
import { requireState } from "./errors";

const D = Prisma.Decimal;
export const cost = (value: Prisma.Decimal.Value) =>
  new D(value).toDecimalPlaces(4, D.ROUND_HALF_UP);
export const cash = (value: Prisma.Decimal.Value) =>
  new D(value).toDecimalPlaces(2, D.ROUND_HALF_UP);

export function average(
  oldQty: number,
  oldCost: Prisma.Decimal,
  addedQty: number,
  addedCost: Prisma.Decimal,
) {
  return cost(
    oldCost
      .mul(oldQty)
      .add(addedCost.mul(addedQty))
      .div(oldQty + addedQty),
  );
}

export function jobCosts(input: {
  gramsUsed: number;
  avgCostPerGram: Prisma.Decimal;
  durationMs: number;
  purchaseCost: Prisma.Decimal;
  lifespanHours: number;
  avgWatts: number;
  pricePerKwh: Prisma.Decimal;
  qtyGood: number;
}) {
  requireState(input.durationMs > 0, "Finish time must be after start time");
  const hours = new D(input.durationMs).div(3600000);
  const materialCost = cost(input.avgCostPerGram.mul(input.gramsUsed));
  const machineCost = cost(
    input.purchaseCost.div(input.lifespanHours).mul(hours),
  );
  const energyCost = cost(
    hours.mul(input.avgWatts).div(1000).mul(input.pricePerKwh),
  );
  const total = materialCost.add(machineCost).add(energyCost);
  return {
    materialCost,
    machineCost,
    energyCost,
    unitCost: input.qtyGood ? cost(total.div(input.qtyGood)) : null,
    total,
  };
}
