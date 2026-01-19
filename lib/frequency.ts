import { prisma } from "@/lib/db";

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

/**
 * Apply decay to a single grocery usage record and persist to database
 */
export async function applyDecayAndUpdate(
  name: string,
  now: Date = new Date()
): Promise<number> {
  const usage = await prisma.groceryUsage.findUnique({ where: { name } });
  
  if (!usage) {
    return 0;
  }

  const decayedScore = decayScore(usage.score, usage.lastDecayedAt, now);
  
  if (decayedScore !== usage.score) {
    await prisma.groceryUsage.update({
      where: { name },
      data: {
        score: decayedScore,
        lastDecayedAt: now,
      },
    });
  }

  return decayedScore;
}

/**
 * Increment usage score for a grocery item (with decay applied first)
 */
export async function incrementUsage(
  name: string,
  incrementBy: number = 1,
  now: Date = new Date()
): Promise<void> {
  const usage = await prisma.groceryUsage.findUnique({ where: { name } });

  if (usage) {
    const decayedScore = decayScore(usage.score, usage.lastDecayedAt, now);
    await prisma.groceryUsage.update({
      where: { name },
      data: {
        score: decayedScore + incrementBy,
        lastDecayedAt: now,
      },
    });
  } else {
    await prisma.groceryUsage.create({
      data: {
        name,
        score: incrementBy,
        lastDecayedAt: now,
      },
    });
  }
}

/**
 * Batch update decay for all grocery usage records
 * Returns a map of name -> decayed score
 */
export async function batchDecayUpdate(
  now: Date = new Date()
): Promise<Map<string, number>> {
  const usageRows = await prisma.groceryUsage.findMany();
  const usageMap = new Map<string, number>();

  const updates = usageRows.map(async (usage) => {
    const decayed = decayScore(usage.score, usage.lastDecayedAt, now);
    usageMap.set(usage.name, decayed);

    if (decayed !== usage.score) {
      await prisma.groceryUsage.update({
        where: { id: usage.id },
        data: { score: decayed, lastDecayedAt: now },
      });
    }
  });

  await Promise.all(updates);
  return usageMap;
}
