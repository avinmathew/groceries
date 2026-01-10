import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

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
      return NextResponse.json({ error: "Grocery item not found" }, { status: 404 });
    }

    return NextResponse.json(groceryItem);
  } catch (error) {
    console.error("Error fetching grocery item:", error);
    return NextResponse.json({ error: "Failed to fetch grocery item" }, { status: 500 });
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

    return NextResponse.json(groceryItem);
  } catch (error) {
    console.error("Error updating grocery item:", error);
    return NextResponse.json({ error: "Failed to update grocery item" }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    await prisma.groceryItem.delete({
      where: { id: params.id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting grocery item:", error);
    return NextResponse.json({ error: "Failed to delete grocery item" }, { status: 500 });
  }
}
