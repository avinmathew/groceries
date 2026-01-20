import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { ShoppingListView } from "@/components/shopping-list-view";
import { ShoppingListTracker } from "@/components/shopping-list-tracker";

async function getShoppingList(id: string) {
  const shoppingList = await prisma.shoppingList.findUnique({
    where: { id },
    include: {
      items: {
        include: {
          groceryItem: {
            include: {
              category: true,
              productLinks: true,
              shoppingListItems: true,
            },
          },
        },
      },
    },
  });

  if (!shoppingList) return null;

  // Get all categories with their order
  const categories = await prisma.category.findMany({
    orderBy: { order: "asc" },
  });

  // Separate items into completed and not completed
  const activeItems = shoppingList.items.filter((item) => !item.isCompleted);
  const completedItems = shoppingList.items
    .filter((item) => item.isCompleted)
    .sort((a, b) => {
      const aTime = a.completedAt?.getTime() ?? 0;
      const bTime = b.completedAt?.getTime() ?? 0;
      return bTime - aTime; // Most recent first
    });

  // Group active items by category
  const itemsByCategory = new Map<string, typeof activeItems>();
  const uncategorizedItems: typeof activeItems = [];

  for (const item of activeItems) {
    if (item.groceryItem.categoryId) {
      const categoryId = item.groceryItem.categoryId;
      if (!itemsByCategory.has(categoryId)) {
        itemsByCategory.set(categoryId, []);
      }
      itemsByCategory.get(categoryId)!.push(item);
    } else {
      uncategorizedItems.push(item);
    }
  }

  // Sort categories and create category groups
  const categoryGroups = categories
    .map((category) => ({
      category: {
        id: category.id,
        name: category.name,
        order: category.order,
      },
      items: (itemsByCategory.get(category.id) || []).map(sli => ({
        id: sli.id,
        groceryItemId: sli.groceryItemId,
        name: sli.groceryItem.name,
        quantity: sli.quantity,
        notes: sli.notes,
        isCompleted: sli.isCompleted,
        categoryId: sli.groceryItem.categoryId,
        category: category,
        productLinks: sli.groceryItem.productLinks,
        shoppingListCount: sli.groceryItem.shoppingListItems.length,
      })),
    }))
    .filter((group) => group.items.length > 0);

  // Add uncategorized at the end
  if (uncategorizedItems.length > 0) {
    const uncategorizedCategory = { 
      id: "uncategorized", 
      name: "Uncategorised", 
      order: 999999,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    categoryGroups.push({
      category: uncategorizedCategory,
      items: uncategorizedItems.map(sli => ({
        id: sli.id,
        groceryItemId: sli.groceryItemId,
        name: sli.groceryItem.name,
        quantity: sli.quantity,
        notes: sli.notes,
        isCompleted: sli.isCompleted,
        categoryId: sli.groceryItem.categoryId,
        category: uncategorizedCategory,
        productLinks: sli.groceryItem.productLinks,
        shoppingListCount: sli.groceryItem.shoppingListItems.length,
      })),
    });
  }

  // Serialize dates for client-side consumption
  const serializeItem = (item: any) => ({
    ...item,
    createdAt: item.createdAt?.toISOString() || new Date().toISOString(),
    updatedAt: item.updatedAt?.toISOString() || new Date().toISOString(),
    completedAt: item.completedAt?.toISOString() || null,
    productLinks: item.productLinks.map((link: any) => ({
      id: link.id,
      store: link.store,
      regularPrice: link.regularPrice,
      discountPrice: link.discountPrice,
    })),
  });

  const serializedCategoryGroups = categoryGroups.map(group => ({
    category: group.category,
    items: group.items.map(serializeItem),
  }));

  const serializedCompletedItems = completedItems.map(sli => 
    serializeItem({
      id: sli.id,
      groceryItemId: sli.groceryItemId,
      name: sli.groceryItem.name,
      quantity: sli.quantity,
      notes: sli.notes,
      isCompleted: sli.isCompleted,
      categoryId: sli.groceryItem.categoryId,
      category: sli.groceryItem.category || { 
        id: "uncategorized", 
        name: "Uncategorised", 
        order: 999999,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      productLinks: sli.groceryItem.productLinks,
      completedAt: sli.completedAt,
      createdAt: sli.createdAt,
      updatedAt: sli.updatedAt,
      shoppingListCount: sli.groceryItem.shoppingListItems.length,
    })
  );

  return {
    id: shoppingList.id,
    name: shoppingList.name,
    createdAt: shoppingList.createdAt.toISOString(),
    updatedAt: shoppingList.updatedAt.toISOString(),
    categoryGroups: serializedCategoryGroups,
    completedItems: serializedCompletedItems,
  };
}

export default async function ShoppingListPage({ params }: { params: { id: string } }) {
  const shoppingList = await getShoppingList(params.id);

  if (!shoppingList) {
    notFound();
  }

  return (
    <>
      <ShoppingListTracker listId={shoppingList.id} />
      <ShoppingListView shoppingList={shoppingList} />
    </>
  );
}
