import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { scrapePrice, shouldRefreshPrice } from "@/lib/price-scraper";

export async function POST(request: Request) {
  try {
    const { groceryItemId } = await request.json();

    if (groceryItemId) {
      // Refresh prices for a single grocery item
      return await refreshGroceryItemPrices(groceryItemId);
    } else {
      // Refresh prices for all grocery items
      return await refreshAllPrices();
    }
  } catch (error) {
    console.error("Error refreshing prices:", error);
    return NextResponse.json({ error: "Failed to refresh prices" }, { status: 500 });
  }
}

async function refreshGroceryItemPrices(groceryItemId: string) {
  const groceryItem = await prisma.groceryItem.findUnique({
    where: { id: groceryItemId },
    include: { productLinks: true },
  });

  if (!groceryItem) {
    return NextResponse.json({ error: "Grocery item not found" }, { status: 404 });
  }

  const updatedLinks = [];

  for (const link of groceryItem.productLinks) {
    try {
      // Always refresh if prices are missing, otherwise respect the 6-day cooldown
      const hasNoPrice = link.regularPrice === null && link.discountPrice === null;
      if (!hasNoPrice && !shouldRefreshPrice(link.lastRefreshed)) {
        console.log(`Skipping ${link.store} link ${link.id} - refreshed less than 6 days ago`);
        continue;
      }

      console.log(`Scraping ${link.store} price from ${link.url}`);
      const priceData = await scrapePrice(link.url, link.store as any);
      console.log(`Scraped price data:`, priceData);

      if (priceData.regularPrice === null && priceData.discountPrice === null) {
        console.log(`Warning: No price data scraped for ${link.url}`);
      } else {
        // Check if price has changed (only save history if price changed)
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

        // Create price history record if price changed or if this is the first price
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

        console.log(`Updated link ${link.id} with prices: regularPrice=${priceData.regularPrice}, discountPrice=${priceData.discountPrice}`);
        updatedLinks.push(updatedLink);
      }
    } catch (error) {
      console.error(`Error refreshing price for link ${link.id}:`, error);
      // Continue with other links even if one fails
    }
  }

  return NextResponse.json({ success: true, updatedLinks });
}

async function refreshAllPrices() {
  const allLinks = await prisma.productLink.findMany({
    where: {
      OR: [
        { lastRefreshed: null },
        {
          lastRefreshed: {
            lt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000),
          },
        },
      ],
    },
  });

  const updatedLinks = [];

  for (const link of allLinks) {
    try {
      const priceData = await scrapePrice(link.url, link.store as any);

      if (priceData.regularPrice !== null || priceData.discountPrice !== null) {
        // Check if price has changed
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

        // Create price history record if price changed or if this is the first price
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

        updatedLinks.push(updatedLink);
      }
    } catch (error) {
      console.error(`Error refreshing price for link ${link.id}:`, error);
      // Continue with other links even if one fails
    }
  }

  return NextResponse.json({ success: true, updatedLinks });
}
