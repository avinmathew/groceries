import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const shoppingLists = await prisma.shoppingList.findMany({
      include: {
        items: {
          where: {
            isCompleted: false,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json(shoppingLists);
  } catch (error) {
    console.error("Error fetching shopping lists:", error);
    return NextResponse.json({ error: "Failed to fetch shopping lists" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { name } = await request.json();

    if (!name || typeof name !== "string") {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const shoppingList = await prisma.shoppingList.create({
      data: {
        name,
      },
    });

    return NextResponse.json(shoppingList);
  } catch (error) {
    console.error("Error creating shopping list:", error);
    return NextResponse.json({ error: "Failed to create shopping list" }, { status: 500 });
  }
}
