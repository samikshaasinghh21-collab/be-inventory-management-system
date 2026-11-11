export const moneyRound = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
export function manualLopAmount(value) {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount) || amount < 0) {
    throw Object.assign(new Error("LOP must be a valid non-negative amount."), { statusCode: 400 });
  }
  return moneyRound(amount);
}
export const monthKey = (value) => {
  if (/^\d{4}-\d{2}$/.test(value || "")) return /^\d{4}-(0[1-9]|1[0-2])$/.test(value) ? value : "";
  const date = new Date(`1 ${value}`);
  return Number.isNaN(date.getTime()) ? "" : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
};
export function calculateLop(monthlyGross, workingDays, unpaidDays) {
  const working = Number(workingDays || 0), unpaid = Number(unpaidDays || 0);
  if (!Number.isFinite(Number(monthlyGross)) || Number(monthlyGross) < 0 || !Number.isFinite(working) || !Number.isFinite(unpaid) || working < 0 || working > 31 || unpaid < 0 || unpaid > working || (unpaid > 0 && working === 0)) {
    throw Object.assign(new Error("Unpaid days must be between zero and the applicable working days."), { statusCode: 400 });
  }
  return working ? moneyRound(Number(monthlyGross) * unpaid / working) : 0;
}
// Annual rules are explicit; legacy monthly PT remains monthly until configured.
export function monthlyProfessionalTax(rule, month, legacyMonthly = 0) {
  if (!rule || rule.annualAmount == null) return Number(legacyMonthly || 0);
  const annual = Number(rule.annualAmount);
  const key = monthKey(month);
  if (!key || !Number.isFinite(annual) || annual < 0) throw Object.assign(new Error("A valid payroll month and annual PT amount are required."), { statusCode: 400 });
  const index = Number(key.slice(5)) - 1;
  if (!Number.isInteger(Number(rule.adjustmentMonth ?? 3)) || Number(rule.adjustmentMonth ?? 3) < 1 || Number(rule.adjustmentMonth ?? 3) > 12) throw Object.assign(new Error("PT adjustment month must be between 1 and 12."), { statusCode: 400 });
  if (Array.isArray(rule.monthlyAmounts)) {
    if (rule.monthlyAmounts.length !== 12 || rule.monthlyAmounts.some((v) => !Number.isFinite(Number(v)) || Number(v) < 0) || Math.abs(rule.monthlyAmounts.reduce((s, v) => s + Number(v), 0) - annual) > 0.005) {
      throw Object.assign(new Error("The 12 monthly PT deductions must total the annual PT amount."), { statusCode: 400 });
    }
    return moneyRound(rule.monthlyAmounts[index]);
  }
  const regular = Math.floor(annual * 100 / 12) / 100;
  return index === Number(rule.adjustmentMonth ?? 3) - 1 ? moneyRound(annual - regular * 11) : regular;
}
