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
        id: true,
        name: true,
        categoryId: true,
        shoppingListItems: {
          select: {
            isCompleted: true,
            shoppingList: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    type GroceryAggregate = {
      id: string;
      name: string;
      categoryId: string | null;
      shoppingLists: Map<string, { id: string; name: string }>;
    };

    const groceryMap = new Map<string, GroceryAggregate>();

    for (const item of groceryItems) {
      const current: GroceryAggregate = groceryMap.get(item.name) ?? {
        id: item.id,
        name: item.name,
        categoryId: item.categoryId,
        shoppingLists: new Map<string, { id: string; name: string }>(),
      };


      // Track all lists where the item appears (including completed)
      for (const sli of item.shoppingListItems) {
        current.shoppingLists.set(sli.shoppingList.id, {
          id: sli.shoppingList.id,
          name: sli.shoppingList.name,
        });
      }

      groceryMap.set(item.name, current);
    }

    const groceries = Array.from(groceryMap.values())
      .map((entry) => ({
        id: entry.id,
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

    return NextResponse.json(groceries, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      }
    });
  } catch (error) {
    console.error("Error fetching groceries:", error);
    const errorResponse = NextResponse.json({ error: "Failed to fetch groceries" }, { status: 500 });
    errorResponse.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    return errorResponse;
  }
}
