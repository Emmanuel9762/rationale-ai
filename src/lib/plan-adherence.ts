export const PLAN_ADHERENCE_LABELS = {
  followed: "Followed my plan",
  partly: "Partly followed my plan",
  not_followed: "Did not follow my plan",
  unreviewed: "Unreviewed",
  unspecified: "Reviewed without assessment",
} as const;

export type PlanAdherenceGroup = keyof typeof PLAN_ADHERENCE_LABELS;
export function isPlanAdherenceGroup(value: string | null): value is PlanAdherenceGroup {
  return value !== null && Object.hasOwn(PLAN_ADHERENCE_LABELS, value);
}
