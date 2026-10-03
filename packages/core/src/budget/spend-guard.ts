import { BudgetExceededError } from "../errors";

export interface SpendSnapshot {
  spentTodayCents: number;
  spentThisMonthCents: number;
}

export interface SpendLimits {
  dailyCents: number;
  monthlyCents: number;
}

/**
 * Cost control (§20). Callers estimate the cost of an external AI call and ask
 * permission first; actual cost is recorded to the spend ledger afterwards.
 */
export function checkSpend(estimateCents: number, snapshot: SpendSnapshot, limits: SpendLimits) {
  const dailyRemaining = limits.dailyCents - snapshot.spentTodayCents;
  const monthlyRemaining = limits.monthlyCents - snapshot.spentThisMonthCents;
  const allowed = estimateCents <= dailyRemaining && estimateCents <= monthlyRemaining;
  return { allowed, dailyRemaining, monthlyRemaining };
}

export function assertSpend(estimateCents: number, snapshot: SpendSnapshot, limits: SpendLimits): void {
  const r = checkSpend(estimateCents, snapshot, limits);
  if (!r.allowed) {
    throw new BudgetExceededError(
      `AI budget exceeded: need ${estimateCents}¢, daily remaining ${r.dailyRemaining}¢, monthly remaining ${r.monthlyRemaining}¢`,
      r,
    );
  }
}
