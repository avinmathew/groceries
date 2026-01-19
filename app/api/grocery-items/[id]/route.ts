import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { successResponse, notFoundError, serverError, getErrorMessage } from "@/lib/api-utils";

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const groceryItem = await prisma.groceryItem.findUnique({
      where: { id: params.id },
      include: {
        category: true,
        productLinks: true,
        shoppingList: true,
      },
    });

    if (!groceryItem) {
      return notFoundError("Grocery item");
    }

    return successResponse(groceryItem);
  } catch (error) {
    return serverError("Failed to fetch grocery item", getErrorMessage(error));
  }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const { name, quantity, notes, categoryId, isCompleted } = await request.json();

    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (quantity !== undefined) updateData.quantity = quantity;
    if (notes !== undefined) updateData.notes = notes;
    if (categoryId !== undefined) updateData.categoryId = categoryId || null;
    if (isCompleted !== undefined) {
      updateData.isCompleted = isCompleted;
      updateData.completedAt = isCompleted ? new Date() : null;
    }

    const groceryItem = await prisma.groceryItem.update({
      where: { id: params.id },
      data: updateData,
      include: {
        category: true,
        productLinks: true,
      },
    });

    return successResponse(groceryItem, "Grocery item updated successfully");
  } catch (error) {
    return serverError("Failed to update grocery item", getErrorMessage(error));
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    await prisma.groceryItem.delete({
      where: { id: params.id },
    });

    return successResponse({ deleted: true }, "Grocery item deleted successfully");
  } catch (error) {
    return serverError("Failed to delete grocery item", getErrorMessage(error));
  }
}
