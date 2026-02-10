export const HIVE_MEMBER_WEEKLY_EX_GST_CENTS = 2500;
export const NZ_GST_RATE = 0.15;
export const AVERAGE_WEEKS_PER_MONTH = 4.333333;

export function computeWeeklyInclGstCents(weeklyExGstCents) {
    const weekly = Number.isFinite(weeklyExGstCents) ? weeklyExGstCents : Number(weeklyExGstCents);
    if (!Number.isFinite(weekly) || weekly <= 0) return 0;
    return Math.round(weekly * (1 + NZ_GST_RATE));
}

export function computeMonthlyFromWeeklyExGstCents(weeklyExGstCents) {
    const weeklyInclGstCents = computeWeeklyInclGstCents(weeklyExGstCents);
    if (!weeklyInclGstCents) return 0;
    return Math.round(weeklyInclGstCents * AVERAGE_WEEKS_PER_MONTH);
}

export function computeHiveMemberMonthlyCents() {
    return computeMonthlyFromWeeklyExGstCents(HIVE_MEMBER_WEEKLY_EX_GST_CENTS);
}
