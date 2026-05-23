import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { successResponse, notFoundError, serverError, getErrorMessage } from "@/lib/server/api-responses";
import { validateRequest } from "@/lib/server/validate-request";
import { updateShoppingListSchema } from "@/lib/schemas/api-schemas";

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

    const activeSectionStatuses = new Set(['active', 'later']);

    // Separate items by status
    const activeItems = shoppingList.items.filter((item) => activeSectionStatuses.has(item.status));
    const watchlistItems = shoppingList.items.filter((item) => item.status === 'watchlisted');
    const completedItems = shoppingList.items
      .filter((item) => item.status === 'completed')
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
          status: sli.status,
          categoryId: sli.groceryItem.categoryId,
          category: category,
          productLinks: sli.groceryItem.productLinks.map(pl => ({
            id: pl.id,
            store: pl.store,
            label: pl.label,
            perUnit: pl.perUnit,
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
          status: sli.status,
          categoryId: sli.groceryItem.categoryId,
          category: uncategorizedCategory,
          productLinks: sli.groceryItem.productLinks.map(pl => ({
            id: pl.id,
            store: pl.store,
            label: pl.label,
            perUnit: pl.perUnit,
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
      status: sli.status,
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
        label: pl.label,
        perUnit: pl.perUnit,
        regularPrice: pl.regularPrice,
        discountPrice: pl.discountPrice,
        lastRefreshed: pl.lastRefreshed,
      })),
      completedAt: sli.completedAt,
      shoppingListCount: sli.groceryItem.shoppingListItems.length,
    }));

    const formattedWatchlistItems = watchlistItems.map(sli => ({
      id: sli.id,
      groceryItemId: sli.groceryItemId,
      name: sli.groceryItem.name,
      quantity: sli.quantity,
      notes: sli.notes,
      status: sli.status,
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
        label: pl.label,
        perUnit: pl.perUnit,
        regularPrice: pl.regularPrice,
        discountPrice: pl.discountPrice,
        lastRefreshed: pl.lastRefreshed,
      })),
      shoppingListCount: sli.groceryItem.shoppingListItems.length,
    }));

    return NextResponse.json({
      id: shoppingList.id,
      name: shoppingList.name,
      categoryGroups,
      watchlistItems: formattedWatchlistItems,
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
    const result = await validateRequest(request, updateShoppingListSchema);
    if ('error' in result) return result.error;
    
    const { name } = result.data;

    const shoppingList = await prisma.shoppingList.update({
      where: { id: params.id },
      data: { name },
    });

    return successResponse(shoppingList, "Shopping list updated successfully");
  } catch (error) {
    return serverError("Failed to update shopping list", getErrorMessage(error));
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    await prisma.shoppingList.delete({
      where: { id: params.id },
    });

    return successResponse({ success: true }, "Shopping list deleted successfully");
  } catch (error) {
    return serverError("Failed to delete shopping list", getErrorMessage(error));
  }
}
