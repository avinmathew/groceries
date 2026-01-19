import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { decayScore } from "@/lib/frequency";

export async function POST(request: Request) {
  try {
    const { name, shoppingListId, categoryId, quantity = 1 } = await request.json();

    const trimmedName = typeof name === "string" ? name.trim() : "";

    if (!trimmedName || !shoppingListId) {
      return NextResponse.json(
        { error: "Name and shoppingListId are required" },
        { status: 400 }
      );
    }

    const now = new Date();

    // Track frequency of adds with decay
    const usage = await prisma.groceryUsage.findUnique({ where: { name: trimmedName } });
    if (usage) {
      const decayedScore = decayScore(usage.score, usage.lastDecayedAt, now);
      await prisma.groceryUsage.update({
        where: { name: trimmedName },
        data: {
          score: decayedScore + 1,
          lastDecayedAt: now,
        },
      });
    } else {
      await prisma.groceryUsage.create({
        data: {
          name: trimmedName,
          score: 1,
          lastDecayedAt: now,
        },
      });
    }

    // Check if an item with the same name already exists in this shopping list
    const existingItem = await prisma.groceryItem.findFirst({
      where: {
        name: trimmedName,
        shoppingListId,
        isCompleted: false, // Only check active (not completed) items
      },
    });

    let groceryItem;

    if (existingItem) {
      // If item exists, increment its quantity
      groceryItem = await prisma.groceryItem.update({
        where: { id: existingItem.id },
        data: {
          quantity: existingItem.quantity + 1,
        },
        include: {
          category: true,
          productLinks: true,
        },
      });
    } else {
      // If item doesn't exist, create a new one
      groceryItem = await prisma.groceryItem.create({
        data: {
          name: trimmedName,
          shoppingListId,
          categoryId: categoryId || null,
          quantity,
        },
        include: {
          category: true,
          productLinks: true,
        },
      });
    }

    return NextResponse.json(groceryItem);
  } catch (error) {
    console.error("Error creating grocery item:", error);
    return NextResponse.json({ error: "Failed to create grocery item" }, { status: 500 });
  }
}
