import Dexie, { Table } from 'dexie';

// Mirror Prisma models for offline storage
export interface ShoppingList {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  _synced?: boolean;
}

export interface GroceryItem {
  id: string;
  name: string;
  categoryId: string | null;
  createdAt?: string;
  updatedAt?: string;
  _synced?: boolean;
}

export interface ShoppingListItem {
  id: string;
  shoppingListId: string;
  groceryItemId: string;
  quantity: number;
  notes: string | null;
  status: string; // 'active' | 'watchlisted' | 'completed'
  completedAt?: string | Date | null;
  createdAt?: string;
  updatedAt?: string;
  // Denormalized for display
  groceryItem?: GroceryItem;
  category?: Category;
  productLinks?: ProductLink[];
  _synced?: boolean;
}

export interface Category {
  id: string;
  name: string;
  displayOrder: number;
  createdAt?: string;
  updatedAt?: string;
  _synced?: boolean;
}

export interface ProductLink {
  id: string;
  groceryItemId: string;
  url: string;
  store: string;
  label?: string | null;
  perUnit?: number | null;
  regularPrice?: number | null;
  discountPrice?: number | null;
  lastRefreshed?: string | null;
  lastScrapedAt: string | null;
  createdAt: string;
  updatedAt: string;
  currentPrice?: number | null;
  _synced?: boolean;
}

export interface PriceHistory {
  id: string;
  productLinkId: string;
  price: number;
  scrapedAt: string;
  _synced?: boolean;
}

export interface PendingMutation {
  id: string; // client-generated UUID (also used as idempotency key)
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  url: string;
  body?: any;
  timestamp: string;
  retries: number;
  error?: string;
  idempotencyKey: string; // For server-side deduplication
}

export class OfflineDB extends Dexie {
  shoppingLists!: Table<ShoppingList, string>;
  groceryItems!: Table<GroceryItem, string>;
  shoppingListItems!: Table<ShoppingListItem, string>;
  categories!: Table<Category, string>;
  productLinks!: Table<ProductLink, string>;
  priceHistory!: Table<PriceHistory, string>;
  pendingMutations!: Table<PendingMutation, string>;

  constructor() {
    super('GroceriesOfflineDB');
    // Version 1: Original schema
    this.version(1).stores({
      shoppingLists: 'id, name, updatedAt',
      groceryItems: 'id, name, categoryId, updatedAt',
      shoppingListItems: 'id, shoppingListId, groceryItemId, completed, updatedAt',
      categories: 'id, name, displayOrder, updatedAt',
      productLinks: 'id, groceryItemId, store, updatedAt',
      priceHistory: 'id, productLinkId, scrapedAt',
      pendingMutations: 'id, timestamp, url',
    });
    
    // Version 2: Update schema to match Prisma (status replaces completed)
    this.version(2).stores({
      shoppingLists: 'id, name, refreshStatus, updatedAt',
      groceryItems: 'id, name, categoryId, updatedAt',
      shoppingListItems: 'id, shoppingListId, groceryItemId, status, updatedAt',
      categories: 'id, name, displayOrder, updatedAt',
      productLinks: 'id, groceryItemId, store, updatedAt',
      priceHistory: 'id, productLinkId, scrapedAt',
      pendingMutations: 'id, timestamp, url',
    }).upgrade(async (tx) => {
      // Migrate completed boolean to status string
      const items = await tx.table('shoppingListItems').toArray();
      for (const item of items) {
        if ('completed' in item) {
          (item as any).status = (item as any).completed ? 'completed' : 'active';
          delete (item as any).completed;
          await tx.table('shoppingListItems').put(item);
        }
      }
    });

    // Version 3: Drop refreshStatus from shopping lists
    this.version(3).stores({
      shoppingLists: 'id, name, updatedAt',
      groceryItems: 'id, name, categoryId, updatedAt',
      shoppingListItems: 'id, shoppingListId, groceryItemId, status, updatedAt',
      categories: 'id, name, displayOrder, updatedAt',
      productLinks: 'id, groceryItemId, store, updatedAt',
      priceHistory: 'id, productLinkId, scrapedAt',
      pendingMutations: 'id, timestamp, url',
    });
  }
}

export const offlineDB = new OfflineDB();
