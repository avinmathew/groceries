import { offlineDB } from "../offline-db";
import { enqueueMutation } from "../mutation-queue";

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
 * Exported for testing
 */
export async function cacheResponse(url: string, data: any): Promise<void> {
  try {
    // Extract API response data
    const responseData = data?.data || data;
    
    if (url.includes('/api/shopping-lists/') && !url.includes('/api/shopping-lists?')) {
      // Single shopping list with categoryGroups, watchlistItems, completedItems
      if (responseData.id) {
        await offlineDB.shoppingLists.put({
          id: responseData.id,
          name: responseData.name,
          refreshStatus: responseData.refreshStatus,
          createdAt: responseData.createdAt,
          updatedAt: responseData.updatedAt,
          _synced: true,
        });
        
        // Helper to cache an item with its related data
        const cacheItem = async (item: any) => {
          // Cache the shopping list item
          await offlineDB.shoppingListItems.put({
            id: item.id,
            groceryItemId: item.groceryItemId,
            shoppingListId: responseData.id,
            quantity: item.quantity,
            notes: item.notes,
            status: item.status,
            completedAt: item.completedAt,
            createdAt: item.createdAt,
            updatedAt: item.updatedAt,
            _synced: true,
          });
          
          // Cache the grocery item
          await offlineDB.groceryItems.put({
            id: item.groceryItemId,
            name: item.name,
            categoryId: item.categoryId,
            _synced: true,
          });
          
          // Cache product links
          if (item.productLinks) {
            for (const link of item.productLinks) {
              await offlineDB.productLinks.put({
                id: link.id,
                url: link.url || '',
                store: link.store,
                groceryItemId: item.groceryItemId,
                label: link.label,
                perUnit: link.perUnit,
                regularPrice: link.regularPrice,
                discountPrice: link.discountPrice,
                lastRefreshed: link.lastRefreshed,
                lastScrapedAt: null,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                _synced: true,
              });
            }
          }
        };
        
        // Cache items from categoryGroups
        if (responseData.categoryGroups) {
          for (const group of responseData.categoryGroups) {
            // Cache category
            if (group.category && group.category.id !== 'uncategorized') {
              await offlineDB.categories.put({
                id: group.category.id,
                name: group.category.name,
                displayOrder: group.category.order,
                _synced: true,
              });
            }
            
            // Cache items in this category
            if (group.items) {
              for (const item of group.items) {
                await cacheItem(item);
              }
            }
          }
        }
        
        // Cache watchlist items
        if (responseData.watchlistItems) {
          for (const item of responseData.watchlistItems) {
            await cacheItem(item);
          }
        }
        
        // Cache completed items
        if (responseData.completedItems) {
          for (const item of responseData.completedItems) {
            await cacheItem(item);
          }
        }
      }
    } else if (url.includes('/api/shopping-lists')) {
      // List of shopping lists
      const listsArray = Array.isArray(responseData) ? responseData : responseData?.data || [];
      for (const list of listsArray) {
        await offlineDB.shoppingLists.put({
          ...list,
          _synced: true,
        });
      }
    } else if (url.includes('/api/categories')) {
      // Categories
      const categoriesArray = Array.isArray(responseData) ? responseData : responseData?.data || [];
      for (const category of categoriesArray) {
        await offlineDB.categories.put({
          ...category,
          _synced: true,
        });
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
 * Exported for testing
 */
export async function getCachedResponse<T>(url: string): Promise<T | null> {
  try {
    if (url.includes('/api/shopping-lists/') && !url.includes('/api/shopping-lists?')) {
      // Single shopping list - reconstruct the API shape
      const listId = url.split('/api/shopping-lists/')[1].split('/')[0].split('?')[0];
      const list = await offlineDB.shoppingLists.get(listId);
      if (!list) return null;
      
      // Get all categories
      const categories = await offlineDB.categories.orderBy('displayOrder').toArray();
      
      // Get all items for this list
      const allItems = await offlineDB.shoppingListItems
        .where('shoppingListId')
        .equals(listId)
        .toArray();
      
      // Enrich items with grocery item data and product links
      const enrichedItems = await Promise.all(
        allItems.map(async (item) => {
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
            id: item.id,
            groceryItemId: item.groceryItemId,
            name: groceryItem?.name || '',
            quantity: item.quantity,
            notes: item.notes,
            status: item.status,
            categoryId: groceryItem?.categoryId,
            category: category || {
              id: "uncategorized",
              name: "Uncategorised",
              order: 999999,
            },
            productLinks: productLinks.map(pl => ({
              id: pl.id,
              store: pl.store,
              label: pl.label,
              perUnit: pl.perUnit,
              regularPrice: pl.regularPrice,
              discountPrice: pl.discountPrice,
              lastRefreshed: pl.lastRefreshed,
            })),
            completedAt: item.completedAt,
            shoppingListCount: 1, // Approximate offline
          };
        })
      );
      
      // Separate items by status
      const activeItems = enrichedItems.filter(item => item.status === 'active');
      const watchlistItems = enrichedItems.filter(item => item.status === 'watchlisted');
      const completedItems = enrichedItems
        .filter(item => item.status === 'completed')
        .sort((a, b) => {
          // Handle both string and Date types for completedAt
          const aTime = a.completedAt 
            ? (typeof a.completedAt === 'string' ? new Date(a.completedAt).getTime() : a.completedAt.getTime())
            : 0;
          const bTime = b.completedAt
            ? (typeof b.completedAt === 'string' ? new Date(b.completedAt).getTime() : b.completedAt.getTime())
            : 0;
          return bTime - aTime; // Most recent first
        });
      
      // Group active items by category
      const itemsByCategory = new Map<string, typeof activeItems>();
      const uncategorizedItems: typeof activeItems = [];
      
      for (const item of activeItems) {
        if (item.categoryId) {
          if (!itemsByCategory.has(item.categoryId)) {
            itemsByCategory.set(item.categoryId, []);
          }
          itemsByCategory.get(item.categoryId)!.push(item);
        } else {
          uncategorizedItems.push(item);
        }
      }
      
      // Build category groups
      const categoryGroups = categories
        .map((category) => ({
          category: {
            id: category.id,
            name: category.name,
            order: category.displayOrder,
          },
          items: itemsByCategory.get(category.id) || [],
        }))
        .filter((group) => group.items.length > 0);
      
      // Add uncategorized if present
      if (uncategorizedItems.length > 0) {
        categoryGroups.push({
          category: {
            id: "uncategorized",
            name: "Uncategorised",
            order: 999999,
          },
          items: uncategorizedItems,
        });
      }
      
      // Return the same shape as the API
      return {
        id: list.id,
        name: list.name,
        refreshStatus: list.refreshStatus || 'idle',
        categoryGroups,
        watchlistItems,
        completedItems,
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
