import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    // Get unique grocery names from all grocery items
    const groceries = await prisma.groceryItem.findMany({
      select: {
        name: true,
        categoryId: true,
      },
      distinct: ["name"],
    });

    return NextResponse.json(groceries);
  } catch (error) {
    console.error("Error fetching groceries:", error);
    return NextResponse.json({ error: "Failed to fetch groceries" }, { status: 500 });
  }
}
