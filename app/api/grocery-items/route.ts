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

    // Find or create the GroceryItem (the product catalog entry)
    let groceryItem = await prisma.groceryItem.findFirst({
      where: {
        name: trimmedName,
      },
    });

    if (!groceryItem) {
      // Create a new grocery item if it doesn't exist
      groceryItem = await prisma.groceryItem.create({
        data: {
          name: trimmedName,
          categoryId: categoryId || null,
        },
      });
    }

    // Check if this item is already on this shopping list (regardless of completion)
    const existingShoppingListItem = await prisma.shoppingListItem.findFirst({
      where: {
        groceryItemId: groceryItem.id,
        shoppingListId,
      },
    });

    let shoppingListItem;

    if (existingShoppingListItem) {
      // Determine update logic based on completion status:
      // - If crossed off (completed): uncross without changing quantity
      // - If not crossed off: increment quantity by requested amount
      const updateData: any = {
        status: 'active',
        completedAt: null,
      };

      if (existingShoppingListItem.status !== 'completed') {
        // Item is already on the list and not crossed off - increment quantity
        updateData.quantity = (existingShoppingListItem.quantity ?? 0) + (quantity ?? 1);
      }
      // If crossed off, keep existing quantity (no change)

      shoppingListItem = await prisma.shoppingListItem.update({
        where: { id: existingShoppingListItem.id },
        data: updateData,
        include: {
          groceryItem: {
            include: {
              category: true,
              productLinks: true,
            },
          },
        },
      });
    } else {
      // Create a new shopping list item
      shoppingListItem = await prisma.shoppingListItem.create({
        data: {
          groceryItemId: groceryItem.id,
          shoppingListId,
          quantity,
        },
        include: {
          groceryItem: {
            include: {
              category: true,
              productLinks: true,
            },
          },
        },
      });
    }

    return successResponse(shoppingListItem, "Item added to shopping list successfully", 201);
  } catch (error) {
    return serverError("Failed to add item to shopping list", getErrorMessage(error));
  }
}
