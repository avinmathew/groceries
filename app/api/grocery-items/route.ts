import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { incrementUsage } from "@/lib/frequency";
import { successResponse, validationError, serverError, getErrorMessage } from "@/lib/api-utils";

export async function POST(request: Request) {
  try {
    const { name, shoppingListId, categoryId, quantity = 1 } = await request.json();

    const trimmedName = typeof name === "string" ? name.trim() : "";

    if (!trimmedName || !shoppingListId) {
      return validationError("Name and shoppingListId are required");
    }

    const now = new Date();

    // Track frequency of adds with decay (centralized logic)
    await incrementUsage(trimmedName, 1, now);

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

    return successResponse(groceryItem, "Grocery item created successfully", 201);
  } catch (error) {
    return serverError("Failed to create grocery item", getErrorMessage(error));
  }
}
