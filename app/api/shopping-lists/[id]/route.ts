import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const shoppingList = await prisma.shoppingList.findUnique({
      where: { id: params.id },
      include: {
        items: {
          include: {
            category: true,
            productLinks: true,
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
      if (item.categoryId) {
        const categoryId = item.categoryId;
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
        items: itemsByCategory.get(category.id) || [],
      }))
      .filter((group) => group.items.length > 0);

    // Add uncategorized at the end
    if (uncategorizedItems.length > 0) {
      categoryGroups.push({
        category: { id: "uncategorized", name: "Uncategorised", order: 999999 },
        items: uncategorizedItems,
      });
    }

    return NextResponse.json({
      id: shoppingList.id,
      name: shoppingList.name,
      categoryGroups,
      completedItems,
    });
  } catch (error) {
    console.error("Error fetching shopping list:", error);
    return NextResponse.json({ error: "Failed to fetch shopping list" }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const { name } = await request.json();

    const shoppingList = await prisma.shoppingList.update({
      where: { id: params.id },
      data: {
        ...(name && { name }),
      },
    });

    // Revalidate the shopping lists page to show updated data
    revalidatePath("/shopping-lists");
    revalidatePath(`/shopping-lists/${params.id}`);

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
