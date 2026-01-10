import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    // Get all product links for this grocery item
    const groceryItem = await prisma.groceryItem.findUnique({
      where: { id: params.id },
      include: {
        productLinks: {
          include: {
            priceHistory: {
              orderBy: { recordedAt: "desc" },
            },
          },
        },
      },
    });

    if (!groceryItem) {
      return NextResponse.json({ error: "Grocery item not found" }, { status: 404 });
    }

    // Combine all price history from all product links
    const allHistory = groceryItem.productLinks.flatMap((link) =>
      link.priceHistory.map((history) => ({
        ...history,
        store: link.store,
        productLinkId: link.id,
      }))
    );

    return NextResponse.json(allHistory);
  } catch (error) {
    console.error("Error fetching price history:", error);
    return NextResponse.json(
      { error: "Failed to fetch price history" },
      { status: 500 }
    );
  }
}
