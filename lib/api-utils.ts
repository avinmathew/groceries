import { NextResponse } from "next/server";
import { offlineDB } from "./offline-db";
import { enqueueMutation } from "./mutation-queue";

export type ApiError = {
  error: string;
  details?: string;
  code?: string;
};

export type ApiSuccess<T = unknown> = {
  data: T;
  message?: string;
};

/**
 * Standard success response helper
 */
export function successResponse<T>(data: T, message?: string, status = 200): NextResponse {
  const response: ApiSuccess<T> = { data };
  if (message) response.message = message;
  return NextResponse.json(response, { status });
}

/**
 * Standard error response helper
 */
export function errorResponse(
  error: string,
  status = 500,
  details?: string,
  code?: string
): NextResponse {
  const response: ApiError = { error };
  if (details) response.details = details;
  if (code) response.code = code;
  
  console.error(`API Error (${status}):`, { error, details, code });
  
  return NextResponse.json(response, { status });
}

/**
 * Validation error response (400)
 */
export function validationError(message: string, details?: string): NextResponse {
  return errorResponse(message, 400, details, "VALIDATION_ERROR");
}

/**
 * Not found error response (404)
 */
export function notFoundError(resource: string): NextResponse {
  return errorResponse(`${resource} not found`, 404, undefined, "NOT_FOUND");
}

/**
 * Internal server error response (500)
 */
export function serverError(message = "Internal server error", details?: string): NextResponse {
  return errorResponse(message, 500, details, "INTERNAL_ERROR");
}

/**
 * Extract error message from unknown error type
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "An unknown error occurred";
}

/**
 * Offline-aware fetch for GET requests
 * Tries cache first, falls back to network, updates cache on success
 */
export async function offlineFetch<T = any>(
  url: string,
  options?: RequestInit
): Promise<T> {
  const method = options?.method?.toUpperCase() || 'GET';
  
  // For mutations, queue and return optimistic result
  if (method !== 'GET' && method !== 'HEAD') {
    throw new Error('Use queueMutation() for POST/PATCH/PUT/DELETE');
  }

  // Try network first for GET
  if (navigator.onLine) {
    try {
      const response = await fetch(url, options);
      if (response.ok) {
        const data = await response.json();
        // Cache the response in IndexedDB based on URL pattern
        await cacheResponse(url, data);
        return data;
      }
    } catch (error) {
      console.warn('Network fetch failed, falling back to cache:', error);
    }
  }

  // Fall back to cache
  const cached = await getCachedResponse<T>(url);
  if (cached) {
    return cached;
  }

  throw new Error('No cached data available and network is offline');
}

/**
 * Queue a mutation to be executed when online
 * Returns optimistic local data immediately
 */
export async function queueMutation<T = any>(
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  url: string,
  body?: any,
  optimisticUpdate?: () => Promise<T>
): Promise<T | null> {
  // Apply optimistic update to local IndexedDB
  let optimisticResult: T | null = null;
  if (optimisticUpdate) {
    optimisticResult = await optimisticUpdate();
  }

  // Try immediate network request if online
  if (navigator.onLine) {
    try {
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      
      if (response.ok) {
        const data = await response.json();
        // Invalidate related caches first, then update with new data
        await invalidateCache(url);
        await cacheResponse(url, data);
        // Don't queue - request succeeded
        return data;
      } else {
        // Network request failed, queue it
        console.warn(`Request failed with ${response.status}, queueing mutation`);
        await enqueueMutation(method, url, body);
      }
    } catch (error) {
      console.warn('Mutation failed, queueing for later sync:', error);
      await enqueueMutation(method, url, body);
    }
  } else {
    // Offline, queue the mutation
    console.log('Offline: queueing mutation for later sync');
    await enqueueMutation(method, url, body);
  }

  return optimisticResult;
}

/**
 * Invalidate cache entries based on URL pattern
 */
export async function invalidateCache(url: string): Promise<void> {
  try {
    if (url.includes('/api/grocery-items')) {
      // If a grocery item was modified, invalidate all shopping lists that might contain it
      // We clear shopping list items cache since the structure changed
      const allShoppingListIds = (await offlineDB.shoppingLists.toArray()).map(l => l.id);
      for (const listId of allShoppingListIds) {
        const items = await offlineDB.shoppingListItems.where('shoppingListId').equals(listId).toArray();
        for (const item of items) {
          await offlineDB.shoppingListItems.delete(item.id);
        }
      }
    } else if (url.includes('/api/shopping-lists/')) {
      // If a shopping list was modified, clear its items
      const listId = url.split('/api/shopping-lists/')[1]?.split('/')[0]?.split('?')[0];
      if (listId) {
        const items = await offlineDB.shoppingListItems.where('shoppingListId').equals(listId).toArray();
        for (const item of items) {
          await offlineDB.shoppingListItems.delete(item.id);
        }
      }
    }
  } catch (error) {
    console.error('Error invalidating cache:', error);
  }
}

/**
 * Cache response data based on URL pattern
 */
async function cacheResponse(url: string, data: any): Promise<void> {
  try {
    // Extract API response data
    const responseData = data?.data || data;
    
    if (url.includes('/api/shopping-lists/') && !url.includes('/api/shopping-lists?')) {
      // Single shopping list with items
      if (responseData.id) {
        await offlineDB.shoppingLists.put({
          id: responseData.id,
          name: responseData.name,
          createdAt: responseData.createdAt,
          updatedAt: responseData.updatedAt,
          _synced: true,
        });
        
        // Cache shopping list items
        if (responseData.items) {
          for (const item of responseData.items) {
            await offlineDB.shoppingListItems.put({
              ...item,
              _synced: true,
            });
            
            // Cache grocery item
            if (item.groceryItem) {
              await offlineDB.groceryItems.put({
                ...item.groceryItem,
                _synced: true,
              });
            }
            
            // Cache product links
            if (item.productLinks) {
              for (const link of item.productLinks) {
                await offlineDB.productLinks.put({
                  ...link,
                  _synced: true,
                });
              }
            }
          }
        }
      }
    } else if (url.includes('/api/shopping-lists')) {
      // List of shopping lists
      if (Array.isArray(responseData)) {
        for (const list of responseData) {
          await offlineDB.shoppingLists.put({
            ...list,
            _synced: true,
          });
        }
      }
    } else if (url.includes('/api/categories')) {
      // Categories
      if (Array.isArray(responseData)) {
        for (const category of responseData) {
          await offlineDB.categories.put({
            ...category,
            _synced: true,
          });
        }
      }
    } else if (url.includes('/api/grocery-items/')) {
      // Single grocery item
      if (responseData.id) {
        await offlineDB.groceryItems.put({
          id: responseData.id,
          name: responseData.name,
          categoryId: responseData.categoryId,
          createdAt: responseData.createdAt,
          updatedAt: responseData.updatedAt,
          _synced: true,
        });
      }
    }
  } catch (error) {
    console.error('Error caching response:', error);
  }
}

/**
 * Get cached response based on URL pattern
 */
async function getCachedResponse<T>(url: string): Promise<T | null> {
  try {
    if (url.includes('/api/shopping-lists/') && !url.includes('/api/shopping-lists?')) {
      // Single shopping list
      const listId = url.split('/api/shopping-lists/')[1].split('/')[0].split('?')[0];
      const list = await offlineDB.shoppingLists.get(listId);
      if (!list) return null;
      
      // Get items for this list
      const items = await offlineDB.shoppingListItems
        .where('shoppingListId')
        .equals(listId)
        .toArray();
      
      // Enrich with grocery items and links
      const enrichedItems = await Promise.all(
        items.map(async (item) => {
          const groceryItem = await offlineDB.groceryItems.get(item.groceryItemId);
          const productLinks = await offlineDB.productLinks
            .where('groceryItemId')
            .equals(item.groceryItemId)
            .toArray();
          
          let category = null;
          if (groceryItem?.categoryId) {
            category = await offlineDB.categories.get(groceryItem.categoryId);
          }
          
          return {
            ...item,
            groceryItem,
            category,
            productLinks,
          };
        })
      );
      
      return {
        data: {
          ...list,
          items: enrichedItems,
        },
      } as T;
    } else if (url.includes('/api/shopping-lists')) {
      // List of shopping lists
      const lists = await offlineDB.shoppingLists.toArray();
      return { data: lists } as T;
    } else if (url.includes('/api/categories')) {
      // Categories
      const categories = await offlineDB.categories.orderBy('displayOrder').toArray();
      return { data: categories } as T;
    }
    
    return null;
  } catch (error) {
    console.error('Error getting cached response:', error);
    return null;
  }
}
