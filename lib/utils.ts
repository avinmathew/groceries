import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// __NEXT_ROUTER_BASEPATH is set by Next.js from next.config.mjs basePath
// This is the recommended way to access basePath in client components
export const BASE_PATH = process.env.__NEXT_ROUTER_BASEPATH || '';

/**
 * Get the most recent Wednesday at 00:00:00 (including today if today is Wednesday)
 */
export function getLastWednesday(): Date {
  const today = new Date();
  const day = today.getDay(); // 0 = Sunday, 3 = Wednesday
  const daysToSubtract = day === 3 ? 0 : (day + 4) % 7; // If today is Wednesday, use today; otherwise go back to most recent Wednesday
  
  const lastWednesday = new Date(today);
  lastWednesday.setDate(lastWednesday.getDate() - daysToSubtract);
  lastWednesday.setHours(0, 0, 0, 0);
  
  return lastWednesday;
}

/**
 * Check if a price refresh timestamp is stale (older than last Wednesday)
 */
export function isPriceStale(lastRefreshed: Date | null | undefined): boolean {
  if (!lastRefreshed) return true; // No refresh timestamp means stale
  
  const lastRefreshedDate = new Date(lastRefreshed);
  const lastWednesday = getLastWednesday();
  
  return lastRefreshedDate < lastWednesday;
}
