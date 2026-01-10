import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

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
