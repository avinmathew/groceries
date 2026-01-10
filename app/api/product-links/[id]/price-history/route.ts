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

    return NextResponse.json(priceHistory);
  } catch (error) {
    console.error("Error fetching price history:", error);
    return NextResponse.json(
      { error: "Failed to fetch price history" },
      { status: 500 }
    );
  }
}
