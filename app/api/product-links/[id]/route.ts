import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const body = await request.json();
    const { regularPrice, discountPrice, lastRefreshed } = body;

    const updatedLink = await prisma.productLink.update({
      where: { id: params.id },
      data: {
        ...(regularPrice !== undefined && { regularPrice }),
        ...(discountPrice !== undefined && { discountPrice }),
        ...(lastRefreshed !== undefined && { lastRefreshed }),
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
