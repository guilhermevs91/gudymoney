import type { PrismaClient, PlanType } from '@prisma/client';

export const FEATURE_KEYS = {
  MAX_ACCOUNTS: 'max_accounts',
  MAX_CREDIT_CARDS: 'max_credit_cards',
  MAX_CATEGORIES: 'max_categories',
  MAX_MEMBERS: 'max_members',
  HISTORY_MONTHS: 'history_months',
  MAX_RECURRENCE_MONTHS: 'max_recurrence_months',
} as const;

/**
 * Returns the numeric value from the plan_features table for the given plan
 * and feature key. Returns Infinity when the key is not found (treat as
 * unlimited).
 */
export async function getPlanLimit(
  prisma: PrismaClient,
  plan: PlanType | string,
  featureKey: string,
): Promise<number> {
  // DEV plan has no limits
  if (plan === 'DEV') return Infinity;

  const record = await prisma.planFeature.findUnique({
    where: { plan_feature_key: { plan: plan as PlanType, feature_key: featureKey } },
    select: { feature_value: true },
  });

  if (record === null) {
    return Infinity;
  }

  const parsed = Number(record.feature_value);
  return Number.isFinite(parsed) ? parsed : Infinity;
}

/**
 * Checks whether the current count is within the plan's limit for a given
 * feature key.
 */
export async function checkPlanLimit(
  prisma: PrismaClient,
  plan: PlanType,
  featureKey: string,
  currentCount: number,
): Promise<{ allowed: boolean; limit: number; current: number }> {
  const limit = await getPlanLimit(prisma, plan, featureKey);
  return {
    allowed: currentCount < limit,
    limit,
    current: currentCount,
  };
}
