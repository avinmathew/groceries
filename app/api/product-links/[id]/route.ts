import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const body = await request.json();
    const { regularPrice, discountPrice, lastRefreshed, label, perUnit, url } = body;

    const trimmedUrl = typeof url === "string" ? url.trim() : url;
    if (trimmedUrl === "" || trimmedUrl === null) {
      return NextResponse.json({ error: "url is required" }, { status: 400 });
    }

    const trimmedLabel = typeof label === "string" ? label.trim() : label;

    let parsedPerUnit = perUnit;
    if (perUnit === "") {
      parsedPerUnit = null;
    }
    if (parsedPerUnit !== undefined && parsedPerUnit !== null) {
      const numericPerUnit = Number(parsedPerUnit);
      if (!Number.isFinite(numericPerUnit) || numericPerUnit <= 0) {
        return NextResponse.json({ error: "perUnit must be a positive number" }, { status: 400 });
      }
      parsedPerUnit = numericPerUnit;
    }

    const updatedLink = await prisma.productLink.update({
      where: { id: params.id },
      data: {
        ...(trimmedUrl !== undefined && { url: trimmedUrl }),
        ...(regularPrice !== undefined && { regularPrice }),
        ...(discountPrice !== undefined && { discountPrice }),
        ...(lastRefreshed !== undefined && { lastRefreshed }),
        ...(trimmedLabel !== undefined && { label: trimmedLabel || null }),
        ...(parsedPerUnit !== undefined && { perUnit: parsedPerUnit }),
      },
    });

    return NextResponse.json(updatedLink);
  } catch (error) {
    console.error("Error updating product link:", error);
    return NextResponse.json({ error: "Failed to update product link" }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    await prisma.productLink.delete({
      where: { id: params.id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting product link:", error);
    return NextResponse.json({ error: "Failed to delete product link" }, { status: 500 });
  }
}
