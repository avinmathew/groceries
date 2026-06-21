import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { incrementUsage } from "@/lib/frequency";
import { successResponse, validationError, serverError, getErrorMessage } from "@/lib/server/api-responses";
import { validateRequest } from "@/lib/server/validate-request";
import { addItemToShoppingListSchema } from "@/lib/schemas/api-schemas";
import { getIdempotencyKey, checkIdempotencyKey, storeIdempotencyKey } from "@/lib/server/idempotency";

export async function POST(request: Request) {
  try {
    // Check for idempotency key
    const idempotencyKey = getIdempotencyKey(request);
    if (idempotencyKey) {
      const cached = checkIdempotencyKey(idempotencyKey);
      if (cached) {
        return successResponse(cached.data, "Item added to shopping list successfully (cached)", 201);
      }
    }

    const result = await validateRequest(request, addItemToShoppingListSchema);
    if ('error' in result) return result.error;
    
    const { name, shoppingListId, categoryId, quantity = 1 } = result.data;

    const now = new Date();

    // Track frequency of adds with decay (centralized logic)
    await incrementUsage(name, 1, now);

    // Find or create the GroceryItem (the product catalog entry)
    let groceryItem = await prisma.groceryItem.findFirst({
      where: { name },
    });

    if (!groceryItem) {
      // Create a new grocery item if it doesn't exist
      groceryItem = await prisma.groceryItem.create({
        data: {
          name,
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
      // Uncross the item and set quantity to the requested value in all cases
      const updateData: any = {
        status: 'active',
        completedAt: null,
        quantity: quantity ?? 1,
      };

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

    // Store idempotency key
    if (idempotencyKey) {
      storeIdempotencyKey(idempotencyKey, shoppingListItem);
    }

    return successResponse(shoppingListItem, "Item added to shopping list successfully", 201);
  } catch (error) {
    return serverError("Failed to add item to shopping list", getErrorMessage(error));
  }
}
