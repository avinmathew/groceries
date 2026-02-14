/**
 * Simple in-memory idempotency key store
 * For production, consider using Redis or database
 */

interface IdempotencyRecord {
  key: string;
  response: any;
  timestamp: number;
}

// In-memory cache with 1 hour TTL
const idempotencyStore = new Map<string, IdempotencyRecord>();
const TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Clean up expired idempotency records
 */
function cleanupExpired() {
  const now = Date.now();
  for (const [key, record] of idempotencyStore.entries()) {
    if (now - record.timestamp > TTL_MS) {
      idempotencyStore.delete(key);
    }
  }
}

// Run cleanup every 5 minutes
setInterval(cleanupExpired, 5 * 60 * 1000);

/**
 * Check if an idempotency key has been used before
 * Returns the cached response if it exists
 */
export function checkIdempotencyKey(key: string): { data: any } | null {
  if (!key) return null;
  
  const record = idempotencyStore.get(key);
  if (!record) return null;
  
  // Check if expired
  if (Date.now() - record.timestamp > TTL_MS) {
    idempotencyStore.delete(key);
    return null;
  }
  
  console.log(`✓ Idempotency key hit: ${key}`);
  return { data: record.response };
}

/**
 * Store a response for an idempotency key
 */
export function storeIdempotencyKey(key: string, response: any): void {
  if (!key) return;
  
  idempotencyStore.set(key, {
    key,
    response,
    timestamp: Date.now(),
  });
  
  console.log(`✓ Stored idempotency key: ${key}`);
}

/**
 * Extract idempotency key from request headers
 */
export function getIdempotencyKey(request: Request): string | null {
  try {
    return request.headers.get('X-Idempotency-Key') || null;
  } catch {
    // In test environment, headers might not be available
    return null;
  }
}
