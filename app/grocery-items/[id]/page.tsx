import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { GroceryItemEditView } from "@/components/grocery-item-edit-view";

async function getGroceryItem(id: string) {
  const item = await prisma.groceryItem.findUnique({
    where: { id },
    include: {
      category: true,
      productLinks: true,
      shoppingList: true,
    },
  });

  if (!item) return null;

  const categories = await prisma.category.findMany({
    orderBy: { order: "asc" },
  });

  // Serialize dates for client-side consumption
  const serializedItem = {
    ...item,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    completedAt: item.completedAt?.toISOString() || null,
    category: item.category ? {
      ...item.category,
      createdAt: item.category.createdAt.toISOString(),
      updatedAt: item.category.updatedAt.toISOString(),
    } : null,
    shoppingList: {
      ...item.shoppingList,
      createdAt: item.shoppingList.createdAt.toISOString(),
      updatedAt: item.shoppingList.updatedAt.toISOString(),
    },
    productLinks: item.productLinks.map(link => ({
      ...link,
      createdAt: link.createdAt.toISOString(),
      updatedAt: link.updatedAt.toISOString(),
      lastRefreshed: link.lastRefreshed?.toISOString() || null,
    })),
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
