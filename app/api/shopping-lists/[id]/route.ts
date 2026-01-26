import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const shoppingList = await prisma.shoppingList.findUnique({
      where: { id: params.id },
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

    if (!shoppingList) {
      return NextResponse.json({ error: "Shopping list not found" }, { status: 404 });
    }

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
          productLinks: sli.groceryItem.productLinks.map(pl => ({
            id: pl.id,
            store: pl.store,
            regularPrice: pl.regularPrice,
            discountPrice: pl.discountPrice,
            lastRefreshed: pl.lastRefreshed,
          })),
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
          productLinks: sli.groceryItem.productLinks.map(pl => ({
            id: pl.id,
            store: pl.store,
            regularPrice: pl.regularPrice,
            discountPrice: pl.discountPrice,
            lastRefreshed: pl.lastRefreshed,
          })),
          shoppingListCount: sli.groceryItem.shoppingListItems.length,
        })),
      });
    }

    const formattedCompletedItems = completedItems.map(sli => ({
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
      productLinks: sli.groceryItem.productLinks.map(pl => ({
        id: pl.id,
        store: pl.store,
        regularPrice: pl.regularPrice,
        discountPrice: pl.discountPrice,
        lastRefreshed: pl.lastRefreshed,
      })),
      completedAt: sli.completedAt,
      shoppingListCount: sli.groceryItem.shoppingListItems.length,
    }));

    return NextResponse.json({
      id: shoppingList.id,
      name: shoppingList.name,
      refreshStatus: shoppingList.refreshStatus,
      categoryGroups,
      completedItems: formattedCompletedItems,
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      }
    });
  } catch (error) {
    console.error("Error fetching shopping list:", error);
    const errorResponse = NextResponse.json({ error: "Failed to fetch shopping list" }, { status: 500 });
    errorResponse.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    return errorResponse;
  }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const { name } = await request.json();

    const trimmedName = typeof name === "string" ? name.trim() : name;

    const shoppingList = await prisma.shoppingList.update({
      where: { id: params.id },
      data: {
        ...(trimmedName && { name: trimmedName }),
      },
    });

    return NextResponse.json(shoppingList);
  } catch (error) {
    console.error("Error updating shopping list:", error);
    return NextResponse.json({ error: "Failed to update shopping list" }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    await prisma.shoppingList.delete({
      where: { id: params.id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting shopping list:", error);
    return NextResponse.json({ error: "Failed to delete shopping list" }, { status: 500 });
  }
}
