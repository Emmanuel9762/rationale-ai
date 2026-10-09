export type ReviewInput = {
  planAdherence: "followed" | "partly" | "not_followed";
  reviewWentWell: string | null;
  reviewImprove: string | null;
};
export class ReviewInputError extends Error {}
export function parseReviewInput(data: FormData): ReviewInput {
  function field(name: string) {
    const values = data.getAll(name);
    if (values.length > 1 || (values.length === 1 && typeof values[0] !== "string")) throw new ReviewInputError("Invalid review fields.");
    return (values[0] as string | undefined)?.trim() ?? "";
  }
  const planAdherence = field("planAdherence");
  if (planAdherence !== "followed" && planAdherence !== "partly" && planAdherence !== "not_followed") throw new ReviewInputError("Choose whether you followed your plan.");
  const reviewWentWell = field("reviewWentWell"), reviewImprove = field("reviewImprove");
  if (reviewWentWell.length > 2000 || reviewImprove.length > 2000) throw new ReviewInputError("Each reflection must be 2,000 characters or fewer.");
  if (!reviewWentWell && !reviewImprove) throw new ReviewInputError("Add what went well or what you would improve.");
  return { planAdherence, reviewWentWell: reviewWentWell || null, reviewImprove: reviewImprove || null };
}

