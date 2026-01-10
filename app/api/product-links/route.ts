import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(request: Request) {
  try {
    const { url, store, groceryItemId } = await request.json();

    if (!url || !store || !groceryItemId) {
      return NextResponse.json(
        { error: "url, store, and groceryItemId are required" },
        { status: 400 }
      );
    }

    if (!["woolworths", "coles", "aldi"].includes(store)) {
      return NextResponse.json({ error: "Invalid store" }, { status: 400 });
    }

    const productLink = await prisma.productLink.create({
      data: {
        url,
        store,
        groceryItemId,
      },
    });

    return NextResponse.json(productLink);
  } catch (error) {
    console.error("Error creating product link:", error);
    return NextResponse.json({ error: "Failed to create product link" }, { status: 500 });
  }
}
