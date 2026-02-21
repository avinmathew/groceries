import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { scrapePrice, shouldRefreshPrice, closeBrowser } from "@/lib/price-scraper";

type RefreshScope = 
  | { type: 'single'; itemId: string }
  | { type: 'multiple'; itemIds: string[] }
  | { type: 'all' };

type RefreshRequestBody = {
  groceryItemId?: string;
  groceryItemIds?: string[];
  shoppingListId?: string;
};

type RefreshableLink = {
  id: string;
  url: string;
  store: string;
  regularPrice: number | null;
  discountPrice: number | null;
  lastRefreshed: Date | null;
  groceryItemId: string;
};

export async function POST(request: Request) {
  try {
    const { groceryItemId, groceryItemIds, shoppingListId } = (await request.json()) as RefreshRequestBody;

    let scope: RefreshScope;
    if (groceryItemId) {
      scope = { type: 'single', itemId: groceryItemId };
    } else if (groceryItemIds && Array.isArray(groceryItemIds) && groceryItemIds.length > 0) {
      scope = { type: 'multiple', itemIds: groceryItemIds };
    } else {
      scope = { type: 'all' };
    }

    const { jobId, links } = await createRefreshJob(scope, shoppingListId);

    // Start the refresh process in the background (fire and forget)
    // This allows the response to return immediately so the UI can start polling
    runRefreshJob(jobId, links)
      .then(() => {
        console.log(`Price refresh completed successfully for job ${jobId}`);
      })
      .catch((error) => {
        console.error(`Background price refresh error for job ${jobId}:`, error);
      });

    // Return immediately so client can start polling
    return NextResponse.json({ success: true, message: 'Price refresh started', jobId });
  } catch (error) {
    console.error("Error starting price refresh:", error);
    return NextResponse.json({ error: "Failed to start price refresh" }, { status: 500 });
  }
}

/**
 * Helper: Calculate last Wednesday for refresh schedule
 */
function getLastWednesday(): Date {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 = Sunday, 3 = Wednesday
  const daysSinceWednesday = (dayOfWeek - 3 + 7) % 7;
  const lastWednesday = new Date(now);
  lastWednesday.setDate(now.getDate() - daysSinceWednesday);
  lastWednesday.setHours(0, 0, 0, 0);
  return lastWednesday;
}

/**
 * Helper: Update a product link with new price data
 */
async function updateProductLink(
  link: { id: string; regularPrice: number | null; discountPrice: number | null },
  priceData: { regularPrice: number | null; discountPrice: number | null }
): Promise<{ regularPrice: number | null; discountPrice: number | null }> {
  const priceChanged = 
    link.regularPrice !== priceData.regularPrice || 
    link.discountPrice !== priceData.discountPrice;
  
  const shouldSaveHistory = priceChanged || link.regularPrice === null;

  // Update the product link
  await prisma.productLink.update({
    where: { id: link.id },
    data: {
      regularPrice: priceData.regularPrice,
      discountPrice: priceData.discountPrice,
      lastRefreshed: new Date(),
    },
  });

  // Create price history record if price changed or first time
  if (shouldSaveHistory) {
    await prisma.priceHistory.create({
      data: {
        productLinkId: link.id,
        regularPrice: priceData.regularPrice,
        discountPrice: priceData.discountPrice,
        recordedAt: new Date(),
      },
    });
  }

  return {
    regularPrice: priceData.regularPrice,
    discountPrice: priceData.discountPrice,
  };
}

/**
 * Build links to refresh from requested scope
 */
async function getLinksToRefresh(scope: RefreshScope): Promise<RefreshableLink[]> {
  // Build query based on scope
  const lastWednesday = getLastWednesday();
  const whereClause: {
    OR: Array<{ lastRefreshed: null } | { lastRefreshed: { lt: Date } }>;
    groceryItemId?: { in: string[] };
  } = {
    OR: [
      { lastRefreshed: null },
      { lastRefreshed: { lt: lastWednesday } },
    ],
  };

  if (scope.type === 'single') {
    // For single item, also include links that need refresh based on shouldRefreshPrice logic
    const item = await prisma.groceryItem.findUnique({
      where: { id: scope.itemId },
      include: { productLinks: true },
    });

    if (!item) {
      throw new Error("Grocery item not found");
    }

    // Filter links that need refresh
    const linksToRefresh = item.productLinks.filter(link => {
      const hasNoPrice = link.regularPrice === null && link.discountPrice === null;
      return hasNoPrice || shouldRefreshPrice(link.lastRefreshed);
    });

    return linksToRefresh;
  }

  if (scope.type === 'multiple') {
    whereClause.groceryItemId = { in: scope.itemIds };
  }

  // Fetch links that need refresh
  const links = await prisma.productLink.findMany({ where: whereClause });

  return links;
}

/**
 * Create persisted refresh job and link snapshots
 */
async function createRefreshJob(
  scope: RefreshScope,
  shoppingListId?: string
): Promise<{ jobId: string; links: RefreshableLink[] }> {
  const links = await getLinksToRefresh(scope);

  const job = await prisma.refreshJob.create({
    data: {
      status: 'running',
      scopeType: scope.type,
      shoppingListId: shoppingListId ?? null,
      groceryItemId: scope.type === 'single' ? scope.itemId : null,
      totalLinks: links.length,
      startedAt: new Date(),
    },
  });

  if (links.length > 0) {
    await prisma.refreshJobLink.createMany({
      data: links.map((link) => ({
        refreshJobId: job.id,
        productLinkId: link.id,
        groceryItemId: link.groceryItemId,
        store: link.store,
        status: 'pending',
      })),
    });
  }

  return { jobId: job.id, links };
}

async function runRefreshJob(
  jobId: string,
  links: RefreshableLink[]
): Promise<void> {
  try {
    if (links.length === 0) {
      await prisma.refreshJob.update({
        where: { id: jobId },
        data: {
          status: 'completed',
          finishedAt: new Date(),
        },
      });
      return;
    }

    await processLinks(jobId, links);

    const finalCounts = await prisma.refreshJob.findUnique({
      where: { id: jobId },
      select: { failedLinks: true },
    });
    const hasFailures = (finalCounts?.failedLinks ?? 0) > 0;

    await prisma.refreshJob.update({
      where: { id: jobId },
      data: {
        status: hasFailures ? 'failed' : 'completed',
        error: hasFailures ? `${finalCounts?.failedLinks ?? 0} link(s) failed to refresh` : null,
        finishedAt: new Date(),
      },
    });
  } catch (error) {
    await prisma.refreshJob.update({
      where: { id: jobId },
      data: {
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown refresh error',
        finishedAt: new Date(),
      },
    }).catch((updateError) => {
      console.error(`Failed to mark job ${jobId} as failed:`, updateError);
    });
  } finally {
    await closeBrowser();
  }
}

/**
 * Process and scrape prices for a list of links
 */
async function processLinks(jobId: string, links: RefreshableLink[]): Promise<void> {
  const rateLimitMs = process.env.NODE_ENV === 'test' ? 0 : 5000;
  // Group links by store for parallel processing
  const linksByStore = new Map<string, RefreshableLink[]>();
  links.forEach(link => {
    if (!linksByStore.has(link.store)) {
      linksByStore.set(link.store, []);
    }
    linksByStore.get(link.store)!.push(link);
  });

  // Process stores in parallel, links within each store sequentially
  // Note: Prices are stored in DB immediately after scraping (not batched at the end)
  await Promise.all(
    Array.from(linksByStore.entries()).map(async ([store, storeLinks]) => {
      for (const link of storeLinks) {
        const now = new Date();

        await prisma.refreshJobLink.update({
          where: {
            refreshJobId_productLinkId: {
              refreshJobId: jobId,
              productLinkId: link.id,
            },
          },
          data: {
            status: 'running',
            startedAt: now,
          },
        });

        try {
          const priceData = await scrapePrice(link.url, link.store as any);
          let persistedPrice: { regularPrice: number | null; discountPrice: number | null } = {
            regularPrice: null,
            discountPrice: null,
          };

          if (priceData.regularPrice !== null || priceData.discountPrice !== null) {
            // Immediately persist to database so UI polling can pick it up
            persistedPrice = await updateProductLink(link, priceData);
            console.log(`Stored price for link ${link.id}: regular=${priceData.regularPrice}, discount=${priceData.discountPrice}`);
          } else {
            console.log(`No price data extracted for link ${link.id}`);
          }

          await prisma.$transaction([
            prisma.refreshJobLink.update({
              where: {
                refreshJobId_productLinkId: {
                  refreshJobId: jobId,
                  productLinkId: link.id,
                },
              },
              data: {
                status: 'completed',
                finishedAt: new Date(),
                regularPrice: persistedPrice.regularPrice,
                discountPrice: persistedPrice.discountPrice,
                error: null,
              },
            }),
            prisma.refreshJob.update({
              where: { id: jobId },
              data: {
                processedLinks: { increment: 1 },
                successfulLinks: { increment: 1 },
              },
            }),
          ]);
        } catch (error) {
          console.error(`Error refreshing price for link ${link.id}:`, error);

          const errorMessage = error instanceof Error ? error.message : 'Failed to refresh link';
          await prisma.$transaction([
            prisma.refreshJobLink.update({
              where: {
                refreshJobId_productLinkId: {
                  refreshJobId: jobId,
                  productLinkId: link.id,
                },
              },
              data: {
                status: 'failed',
                finishedAt: new Date(),
                error: errorMessage,
              },
            }),
            prisma.refreshJob.update({
              where: { id: jobId },
              data: {
                processedLinks: { increment: 1 },
                failedLinks: { increment: 1 },
              },
            }),
          ]);

          // Continue with other links even if one fails
        }

        // Rate limit each store call
        if (rateLimitMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, rateLimitMs));
        }
      }
    })
  );
}
