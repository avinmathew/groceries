import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { batchDecayUpdate } from "@/lib/frequency";

export async function GET() {
  try {
    const now = new Date();

    // Load usage scores and apply decay on read
    const usageMap = await batchDecayUpdate(now);

    // Pull the minimal fields we need once, then aggregate in memory
    const groceryItems = await prisma.groceryItem.findMany({
      select: {
        name: true,
        quantity: true,
        categoryId: true,
        isCompleted: true,
        shoppingList: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    type GroceryAggregate = {
      name: string;
      categoryId: string | null;
      shoppingLists: Map<string, { id: string; name: string }>;
    };

    const groceryMap = new Map<string, GroceryAggregate>();

    for (const item of groceryItems) {
      const current: GroceryAggregate = groceryMap.get(item.name) ?? {
        name: item.name,
        categoryId: null,
        shoppingLists: new Map<string, { id: string; name: string }>(),
      };

      // Keep the first known category to aid future auto-assignment if needed
      if (!current.categoryId && item.categoryId) {
        current.categoryId = item.categoryId;
      }

      // Track lists where the item is currently active (not completed)
      if (!item.isCompleted) {
        current.shoppingLists.set(item.shoppingList.id, {
          id: item.shoppingList.id,
          name: item.shoppingList.name,
        });
      }

      groceryMap.set(item.name, current);
    }

    const groceries = Array.from(groceryMap.values())
      .map((entry) => ({
        name: entry.name,
        categoryId: entry.categoryId,
        shoppingLists: Array.from(entry.shoppingLists.values()),
      }))
      .sort((a, b) => {
        const scoreA = usageMap.get(a.name) ?? 0;
        const scoreB = usageMap.get(b.name) ?? 0;
        if (scoreB !== scoreA) return scoreB - scoreA;
        return a.name.localeCompare(b.name);
      });

    return NextResponse.json(groceries);
  } catch (error) {
    console.error("Error fetching groceries:", error);
    return NextResponse.json({ error: "Failed to fetch groceries" }, { status: 500 });
  }
}
