import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { successResponse, notFoundError, serverError, getErrorMessage } from "@/lib/server/api-responses";
import { validateRequest } from "@/lib/server/validate-request";
import { updateShoppingListItemSchema } from "@/lib/schemas/api-schemas";

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    // For compatibility, look up by shopping list item id
    const shoppingListItem = await prisma.shoppingListItem.findUnique({
      where: { id: params.id },
      include: {
        groceryItem: {
          include: {
            category: true,
            productLinks: true,
            shoppingListItems: true,
          },
        },
        shoppingList: true,
      },
    });

    if (shoppingListItem) {
      const response = successResponse(shoppingListItem);
      response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      response.headers.set('Pragma', 'no-cache');
      response.headers.set('Expires', '0');
      return response;
    }

    // Otherwise treat id as grocery item id
    const groceryItem = await prisma.groceryItem.findUnique({
      where: { id: params.id },
      include: {
        category: true,
        productLinks: true,
        shoppingListItems: true,
      },
    });

    if (!groceryItem) {
      return notFoundError("Grocery item");
    }

    const response = successResponse(groceryItem);
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    response.headers.set('Pragma', 'no-cache');
    response.headers.set('Expires', '0');
    return response;
  } catch (error) {
    return serverError("Failed to fetch shopping list item", getErrorMessage(error));
  }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const result = await validateRequest(request, updateShoppingListItemSchema);
    if ('error' in result) return result.error;
    
    const { name, quantity, notes, categoryId, status } = result.data;

    const updateData: any = {};
    if (quantity !== undefined) updateData.quantity = quantity;
    if (notes !== undefined) updateData.notes = notes;
    if (status !== undefined) {
      updateData.status = status;
      updateData.completedAt = status === 'completed' ? new Date() : null;
    }

    // Update the shopping list item
    const shoppingListItem = await prisma.shoppingListItem.update({
      where: { id: params.id },
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

    // If name or categoryId changed, update the underlying grocery item
    if (name !== undefined || categoryId !== undefined) {
      const groceryUpdateData: any = {};
      if (name !== undefined) groceryUpdateData.name = name;
      if (categoryId !== undefined) groceryUpdateData.categoryId = categoryId || null;
      
      await prisma.groceryItem.update({
        where: { id: shoppingListItem.groceryItemId },
        data: groceryUpdateData,
      });
    }

    return successResponse(shoppingListItem, "Shopping list item updated successfully");
  } catch (error) {
    return serverError("Failed to update shopping list item", getErrorMessage(error));
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const scope = new URL(request.url).searchParams.get("scope");

    if (scope === "all") {
      // Delete the grocery item and cascade all shopping list items
      const grocery = await prisma.groceryItem.findUnique({
        where: { id: params.id },
      });

      if (!grocery) {
        return notFoundError("Grocery item");
      }

      await prisma.groceryItem.delete({ where: { id: params.id } });
      return successResponse({ deleted: true }, "Grocery item deleted from all lists");
    }

    // Default: delete a single shopping list item (backwards compatibility)
    const shoppingListItem = await prisma.shoppingListItem.findUnique({
      where: { id: params.id },
      include: {
        groceryItem: {
          include: {
            shoppingListItems: true,
          },
        },
      },
    });

    if (!shoppingListItem) {
      return notFoundError("Shopping list item");
    }

    await prisma.shoppingListItem.delete({ where: { id: params.id } });

    if (shoppingListItem.groceryItem.shoppingListItems.length === 1) {
      await prisma.groceryItem.delete({ where: { id: shoppingListItem.groceryItemId } });
    }

    return successResponse({ deleted: true }, "Shopping list item deleted successfully");
  } catch (error) {
    return serverError("Failed to delete shopping list item", getErrorMessage(error));
  }
}
