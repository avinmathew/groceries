import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(request: Request) {
  try {
    const { name, shoppingListId, categoryId, quantity = 1 } = await request.json();

    if (!name || !shoppingListId) {
      return NextResponse.json(
        { error: "Name and shoppingListId are required" },
        { status: 400 }
      );
    }

    // Check if an item with the same name already exists in this shopping list
    const existingItem = await prisma.groceryItem.findFirst({
      where: {
        name: name.trim(),
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
          name: name.trim(),
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
