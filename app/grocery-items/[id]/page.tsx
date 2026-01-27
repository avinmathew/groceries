import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { GroceryItemEditView } from "@/components/grocery-item-edit-view";
import { unstable_noStore } from "next/cache";

// Force dynamic rendering and disable request caching
export const dynamic = 'force-dynamic';

async function getGroceryItem(id: string) {
  // Disable request cache to ensure fresh data on every load
  unstable_noStore();
  
  const item = await prisma.shoppingListItem.findUnique(
    {
      where: { id },
      include: {
        groceryItem: {
          include: {
            category: true,
            productLinks: true,
            shoppingListItems: true,
          },
        },
        shoppingList: true,
      },
    },
  );

  if (!item) return null;

  const categories = await prisma.category.findMany({
    orderBy: { order: "asc" },
  });

  // Serialize dates for client-side consumption
  const serializedItem = {
    id: item.id,
    groceryItemId: item.groceryItemId,
    name: item.groceryItem.name,
    quantity: item.quantity,
    notes: item.notes,
    isCompleted: item.isCompleted,
    completedAt: item.completedAt?.toISOString() || null,
    categoryId: item.groceryItem.categoryId,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    category: item.groceryItem.category ? {
      ...item.groceryItem.category,
      createdAt: item.groceryItem.category.createdAt.toISOString(),
      updatedAt: item.groceryItem.category.updatedAt.toISOString(),
    } : null,
    shoppingList: {
      ...item.shoppingList,
      createdAt: item.shoppingList.createdAt.toISOString(),
      updatedAt: item.shoppingList.updatedAt.toISOString(),
    },
    productLinks: item.groceryItem.productLinks.map(link => ({
      ...link,
      createdAt: link.createdAt.toISOString(),
      updatedAt: link.updatedAt.toISOString(),
      lastRefreshed: link.lastRefreshed?.toISOString() || null,
    })),
    shoppingListCount: item.groceryItem.shoppingListItems.length,
  };

  return {
    item: serializedItem,
    categories,
  };
}

export default async function GroceryItemPage({ params }: { params: { id: string } }) {
  const data = await getGroceryItem(params.id);

  if (!data) {
    notFound();
  }

  return <GroceryItemEditView item={data.item} categories={data.categories} />;
}
