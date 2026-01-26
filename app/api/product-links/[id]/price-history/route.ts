import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const priceHistory = await prisma.priceHistory.findMany({
      where: { productLinkId: params.id },
      orderBy: { recordedAt: "desc" },
      take: 100, // Limit to last 100 records
    });

    return NextResponse.json(priceHistory, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      }
    });
  } catch (error) {
    console.error("Error fetching price history:", error);
    const errorResponse = NextResponse.json(
      { error: "Failed to fetch price history" },
      { status: 500 }
    );
    errorResponse.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    return errorResponse;
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { searchParams } = new URL(request.url);
    const entryId = searchParams.get('entryId');
    
    if (!entryId) {
      return NextResponse.json(
        { error: "Missing entryId parameter" },
        { status: 400 }
      );
    }

    await prisma.priceHistory.delete({
      where: { id: entryId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting price history entry:", error);
    return NextResponse.json(
      { error: "Failed to delete price history entry" },
      { status: 500 }
    );
  }
}
