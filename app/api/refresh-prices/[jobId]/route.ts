import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  request: Request,
  { params }: { params: { jobId: string } }
) {
  try {
    const prismaAny = prisma as any;

    const refreshJob = await prismaAny.refreshJob.findUnique({
      where: { id: params.jobId },
      include: {
        links: {
          orderBy: [{ createdAt: "asc" }],
          select: {
            id: true,
            productLinkId: true,
            groceryItemId: true,
            store: true,
            status: true,
            error: true,
            startedAt: true,
            finishedAt: true,
            regularPrice: true,
            discountPrice: true,
          },
        },
      },
    });

    if (!refreshJob) {
      const notFoundResponse = NextResponse.json({ error: "Refresh job not found" }, { status: 404 });
      notFoundResponse.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      return notFoundResponse;
    }

    const groupedByItem: Record<string, {
      groceryItemId: string;
      total: number;
      processed: number;
      failed: number;
    }> = refreshJob.links.reduce((acc: Record<string, { groceryItemId: string; total: number; processed: number; failed: number }>, link: {
      groceryItemId: string;
      status: string;
    }) => {
      if (!acc[link.groceryItemId]) {
        acc[link.groceryItemId] = {
          groceryItemId: link.groceryItemId,
          total: 0,
          processed: 0,
          failed: 0,
        };
      }

      acc[link.groceryItemId].total += 1;
      if (link.status === "completed" || link.status === "failed") {
        acc[link.groceryItemId].processed += 1;
      }
      if (link.status === "failed") {
        acc[link.groceryItemId].failed += 1;
      }

      return acc;
    }, {});

    const progressPercentage = refreshJob.totalLinks === 0
      ? 100
      : Math.round((refreshJob.processedLinks / refreshJob.totalLinks) * 100);

    const response = NextResponse.json({
      success: true,
      data: {
        id: refreshJob.id,
        status: refreshJob.status,
        scopeType: refreshJob.scopeType,
        shoppingListId: refreshJob.shoppingListId,
        groceryItemId: refreshJob.groceryItemId,
        totalLinks: refreshJob.totalLinks,
        processedLinks: refreshJob.processedLinks,
        successfulLinks: refreshJob.successfulLinks,
        failedLinks: refreshJob.failedLinks,
        progressPercentage,
        startedAt: refreshJob.startedAt,
        finishedAt: refreshJob.finishedAt,
        error: refreshJob.error,
        itemSummaries: Object.values(groupedByItem),
        links: refreshJob.links,
      },
    });

    response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    response.headers.set("Pragma", "no-cache");
    response.headers.set("Expires", "0");
    return response;
  } catch (error) {
    console.error("Error fetching refresh job status:", error);
    const errorResponse = NextResponse.json({ error: "Failed to fetch refresh job status" }, { status: 500 });
    errorResponse.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    return errorResponse;
  }
}
