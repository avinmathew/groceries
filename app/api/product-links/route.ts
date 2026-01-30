import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(request: Request) {
  try {
    const { url, store, groceryItemId, label, perUnit } = await request.json();

    const trimmedUrl = typeof url === "string" ? url.trim() : "";

    if (!trimmedUrl || !store || !groceryItemId) {
      return NextResponse.json(
        { error: "url, store, and groceryItemId are required" },
        { status: 400 }
      );
    }

    if (!["woolworths", "coles", "aldi"].includes(store)) {
      return NextResponse.json({ error: "Invalid store" }, { status: 400 });
    }

    const trimmedLabel = typeof label === "string" ? label.trim() : null;

    let parsedPerUnit: number | null = null;
    if (perUnit !== undefined && perUnit !== null && perUnit !== "") {
      const numericPerUnit = Number(perUnit);
      if (!Number.isFinite(numericPerUnit) || numericPerUnit <= 0) {
        return NextResponse.json({ error: "perUnit must be a positive number" }, { status: 400 });
      }
      parsedPerUnit = numericPerUnit;
    }

    const productLink = await prisma.productLink.create({
      data: {
        url: trimmedUrl,
        store,
        groceryItemId,
        label: trimmedLabel || null,
        perUnit: parsedPerUnit,
      },
    });

    return NextResponse.json(productLink);
  } catch (error) {
    console.error("Error creating product link:", error);
    return NextResponse.json({ error: "Failed to create product link" }, { status: 500 });
  }
}
