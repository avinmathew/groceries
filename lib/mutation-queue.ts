import { offlineDB, PendingMutation } from './offline-db';
import { invalidateCache } from './client/offline-fetch';

export function generateClientId(): string {
  return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export async function enqueueMutation(
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  url: string,
  body?: any
): Promise<string> {
  const id = generateClientId();
  const mutation: PendingMutation = {
    id,
    method,
    url,
    body,
    timestamp: new Date().toISOString(),
    retries: 0,
    idempotencyKey: id, // Use the same ID as idempotency key
  };
  await offlineDB.pendingMutations.add(mutation);
  console.log(`✓ Queued mutation: ${method} ${url}`, mutation);
  return id;
}

export async function getPendingMutations(): Promise<PendingMutation[]> {
  return offlineDB.pendingMutations.orderBy('timestamp').toArray();
}

export async function removeMutation(id: string): Promise<void> {
  await offlineDB.pendingMutations.delete(id);
}

export async function incrementRetries(id: string, error: string): Promise<void> {
  const mutation = await offlineDB.pendingMutations.get(id);
  if (mutation) {
    await offlineDB.pendingMutations.update(id, {
      retries: mutation.retries + 1,
      error,
    });
  }
}

export async function clearMutationQueue(): Promise<void> {
  await offlineDB.pendingMutations.clear();
}

export interface FlushResult {
  success: number;
  failed: number;
  errors: Array<{ mutation: PendingMutation; error: string }>;
}

export async function flushMutationQueue(): Promise<FlushResult> {
  const mutations = await getPendingMutations();
  const result: FlushResult = { success: 0, failed: 0, errors: [] };

  console.log(`Flushing ${mutations.length} pending mutations...`);

  for (const mutation of mutations) {
    console.log(`Replaying: ${mutation.method} ${mutation.url}`, mutation.body);
    try {
      const response = await fetch(mutation.url, {
        method: mutation.method,
        headers: {
          'Content-Type': 'application/json',
          'X-Idempotency-Key': mutation.idempotencyKey || mutation.id,
        },
        body: mutation.body ? JSON.stringify(mutation.body) : undefined,
      });

      if (response.ok) {
        console.log(`✓ Success: ${mutation.method} ${mutation.url}`);
        // Invalidate cache for this mutation's URL
        await invalidateCache(mutation.url);
        await removeMutation(mutation.id);
        result.success++;
      } else {
        const errorText = await response.text();
        console.error(`✗ Failed: ${mutation.method} ${mutation.url} - ${response.status}`, errorText);
        await incrementRetries(mutation.id, `HTTP ${response.status}: ${errorText}`);
        result.failed++;
        result.errors.push({
          mutation,
          error: `HTTP ${response.status}: ${errorText}`,
        });
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`✗ Error: ${mutation.method} ${mutation.url} - ${errorMsg}`);
      await incrementRetries(mutation.id, errorMsg);
      result.failed++;
      result.errors.push({ mutation, error: errorMsg });
    }
  }

  return result;
}
