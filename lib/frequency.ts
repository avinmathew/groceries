export const HALF_LIFE_DAYS = 30;

// Exponential decay so older adds contribute less; half-life defaults to 30 days.
export function decayScore(
  score: number,
  lastDecayedAt: Date,
  now: Date = new Date(),
  halfLifeDays: number = HALF_LIFE_DAYS
): number {
  if (score <= 0) return 0;
  const elapsedMs = now.getTime() - new Date(lastDecayedAt).getTime();
  if (elapsedMs <= 0) return score;

  const halfLifeMs = halfLifeDays * 24 * 60 * 60 * 1000;
  const decayFactor = Math.exp(-elapsedMs / halfLifeMs);
  return score * decayFactor;
}
