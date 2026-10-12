export const OUTCOME_LABELS = {
  win: "Wins", loss: "Losses", breakeven: "Break-even",
  measured: "Closed with P&L", missing: "Closed without P&L",
} as const;
export type TradeOutcome = keyof typeof OUTCOME_LABELS;
export function isTradeOutcome(value: string): value is TradeOutcome {
  return Object.hasOwn(OUTCOME_LABELS, value);
}

