import type { VaelPlan } from "./vael";

export const prepayPeriods = [1, 3, 6, 12] as const;
export type PrepayMonths = (typeof prepayPeriods)[number];
export type RegistrationStage = "plan" | "prepay" | "details";
export type RegistrationState = { plan: VaelPlan; stage: RegistrationStage; months: PrepayMonths };

export function registrationState(query: {
  plan: string | null;
  step: string | null;
  months: string | null;
}): RegistrationState {
  const plan = query.plan === "plus" ? "plus" : "free";
  const validMonths = prepayPeriods.find((period) => String(period) === query.months);
  const months = validMonths ?? 1;
  const stage =
    query.step === "details"
      ? plan === "plus" && !validMonths
        ? "prepay"
        : "details"
      : query.step === "prepay" && plan === "plus"
        ? "prepay"
        : "plan";
  return { plan, stage, months };
}

export function registrationHref({ plan, stage, months }: RegistrationState) {
  const query = new URLSearchParams({ plan });
  if (stage !== "plan") query.set("step", stage);
  if (plan === "plus") query.set("months", String(months));
  return `/register?${query}`;
}

export const planPrices: Record<PrepayMonths, number> = {
  1: 5,
  3: 13.5,
  6: 25,
  12: 48,
};

export function termSavingsPercent(months: PrepayMonths) {
  const monthByMonth = months * planPrices[1];
  return Math.round((1 - planPrices[months] / monthByMonth) * 100);
}

export function prepayTotal(months: PrepayMonths) {
  return planPrices[months] ?? months * 5;
}
