import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const shoppingList = await prisma.shoppingList.findUnique({
      where: { id: params.id },
      include: {
        items: {
          include: {
            category: true,
            productLinks: true,
          },
          orderBy: [
            { category: { order: "asc" } },
            { createdAt: "asc" },
          ],
        },
      },
    });

    if (!shoppingList) {
      return NextResponse.json({ error: "Shopping list not found" }, { status: 404 });
    }

    return NextResponse.json(shoppingList);
  } catch (error) {
    console.error("Error fetching shopping list:", error);
    return NextResponse.json({ error: "Failed to fetch shopping list" }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const { name } = await request.json();

    const shoppingList = await prisma.shoppingList.update({
      where: { id: params.id },
      data: {
        ...(name && { name }),
      },
    });

    // Revalidate the shopping lists page to show updated data
    revalidatePath("/shopping-lists");
    revalidatePath(`/shopping-lists/${params.id}`);

    return NextResponse.json(shoppingList);
  } catch (error) {
    console.error("Error updating shopping list:", error);
    return NextResponse.json({ error: "Failed to update shopping list" }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    await prisma.shoppingList.delete({
      where: { id: params.id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting shopping list:", error);
    return NextResponse.json({ error: "Failed to delete shopping list" }, { status: 500 });
  }
}
