import { PrismaClient } from '@prisma/client';

process.env.DATABASE_URL = 'file:./e2e.db';

const prisma = new PrismaClient();

export async function resetDatabase() {
  await prisma.priceHistory.deleteMany();
  await prisma.productLink.deleteMany();
  await prisma.shoppingListItem.deleteMany();
  await prisma.groceryItem.deleteMany();
  await prisma.category.deleteMany();
  await prisma.shoppingList.deleteMany();
  await prisma.groceryUsage.deleteMany();
}

export async function disconnectDatabase() {
  await prisma.$disconnect();
}

export async function createShoppingList(name: string, refreshStatus: 'idle' | 'refreshing' = 'idle') {
  return prisma.shoppingList.create({
    data: { name, refreshStatus },
  });
}

export async function createCategory(name: string, order = 0) {
  return prisma.category.create({
    data: { name, order },
  });
}

export async function createGroceryItem(name: string, categoryId?: string | null) {
  return prisma.groceryItem.create({
    data: { name, categoryId: categoryId ?? null },
  });
}

export async function addItemToList(options: {
  shoppingListId: string;
  groceryItemId: string;
  quantity?: number;
  notes?: string | null;
  isCompleted?: boolean;
  completedAt?: Date | null;
}) {
  const { shoppingListId, groceryItemId, quantity = 1, notes = null, isCompleted = false, completedAt } = options;
  return prisma.shoppingListItem.create({
    data: {
      shoppingListId,
      groceryItemId,
      quantity,
      notes,
      isCompleted,
      completedAt: completedAt ?? (isCompleted ? new Date() : null),
    },
  });
}

export async function createProductLink(options: {
  groceryItemId: string;
  url: string;
  store: 'woolworths' | 'coles' | 'aldi';
  regularPrice?: number | null;
  discountPrice?: number | null;
  lastRefreshed?: Date | null;
}) {
  const { groceryItemId, url, store, regularPrice = null, discountPrice = null, lastRefreshed = null } = options;
  return prisma.productLink.create({
    data: {
      groceryItemId,
      url,
      store,
      regularPrice,
      discountPrice,
      lastRefreshed,
    },
  });
}

export async function createPriceHistory(options: {
  productLinkId: string;
  regularPrice?: number | null;
  discountPrice?: number | null;
  recordedAt?: Date;
}) {
  const { productLinkId, regularPrice = null, discountPrice = null, recordedAt = new Date() } = options;
  return prisma.priceHistory.create({
    data: {
      productLinkId,
      regularPrice,
      discountPrice,
      recordedAt,
    },
  });
}

export async function updateShoppingListRefreshStatus(listId: string, status: 'idle' | 'refreshing') {
  return prisma.shoppingList.update({
    where: { id: listId },
    data: { refreshStatus: status },
  });
}
