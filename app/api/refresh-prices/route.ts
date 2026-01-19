import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { scrapePrice, shouldRefreshPrice } from "@/lib/price-scraper";

type RefreshScope = 
  | { type: 'single'; itemId: string }
  | { type: 'multiple'; itemIds: string[] }
  | { type: 'all' };

export async function POST(request: Request) {
  try {
    const { groceryItemId, groceryItemIds } = await request.json();

    let scope: RefreshScope;
    if (groceryItemId) {
      scope = { type: 'single', itemId: groceryItemId };
    } else if (groceryItemIds && Array.isArray(groceryItemIds) && groceryItemIds.length > 0) {
      scope = { type: 'multiple', itemIds: groceryItemIds };
    } else {
      scope = { type: 'all' };
    }

    const updatedLinks = await refreshPrices(scope);
    return NextResponse.json({ success: true, updatedLinks });
  } catch (error) {
    console.error("Error refreshing prices:", error);
    return NextResponse.json({ error: "Failed to refresh prices" }, { status: 500 });
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
): Promise<any> {
  const priceChanged = 
    link.regularPrice !== priceData.regularPrice || 
    link.discountPrice !== priceData.discountPrice;
  
  const shouldSaveHistory = priceChanged || link.regularPrice === null;

  // Update the product link
  const updatedLink = await prisma.productLink.update({
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

  return updatedLink;
}

/**
 * Main refresh function with strategy pattern
 */
async function refreshPrices(scope: RefreshScope): Promise<any[]> {
  // Build query based on scope
  const lastWednesday = getLastWednesday();
  let whereClause: any = {
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

    return await processLinks(linksToRefresh);
  }

  if (scope.type === 'multiple') {
    whereClause.groceryItemId = { in: scope.itemIds };
  }

  // Fetch links that need refresh
  const links = await prisma.productLink.findMany({ where: whereClause });

  return await processLinks(links);
}

/**
 * Process and scrape prices for a list of links
 */
async function processLinks(
  links: Array<{
    id: string;
    url: string;
    store: string;
    regularPrice: number | null;
    discountPrice: number | null;
    lastRefreshed: Date | null;
  }>
): Promise<any[]> {
  // Group links by store for parallel processing
  const linksByStore = new Map<string, typeof links>();
  links.forEach(link => {
    if (!linksByStore.has(link.store)) {
      linksByStore.set(link.store, []);
    }
    linksByStore.get(link.store)!.push(link);
  });

  const updatedLinks: any[] = [];

  // Process stores in parallel, links within each store sequentially
  await Promise.all(
    Array.from(linksByStore.entries()).map(async ([store, storeLinks]) => {
      for (const link of storeLinks) {
        try {
          const priceData = await scrapePrice(link.url, link.store as any);

          if (priceData.regularPrice !== null || priceData.discountPrice !== null) {
            const updated = await updateProductLink(link, priceData);
            updatedLinks.push(updated);
          }
        } catch (error) {
          console.error(`Error refreshing price for link ${link.id}:`, error);
          // Continue with other links even if one fails
        }
      }
    })
  );

  return updatedLinks;
}
