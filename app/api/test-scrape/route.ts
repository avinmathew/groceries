import { NextResponse } from "next/server";
import { scrapePrice } from "@/lib/price-scraper";
import * as cheerio from "cheerio";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");
  const store = searchParams.get("store") as "woolworths" | "coles" | "aldi" | null;

  if (!url || !store) {
    return NextResponse.json(
      { error: "url and store parameters are required" },
      { status: 400 }
    );
  }

  try {
    // Fetch the page to inspect HTML
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Referer": "https://www.woolworths.com.au/",
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Failed to fetch: ${response.status}` },
        { status: response.status }
      );
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Find all script tags with potential price data
    const scriptContents: string[] = [];
    $('script').each((_, el) => {
      const content = $(el).html() || "";
      if (content.includes('price') || content.includes('Price') || content.includes('__NEXT_DATA__')) {
        scriptContents.push(content.substring(0, 500)); // First 500 chars
      }
    });

    // Try to scrape
    const priceData = await scrapePrice(url, store);

    // Also try to extract prices directly using Puppeteer
    let directPrices: any = null;
    if (store === "woolworths") {
      try {
        const puppeteer = require("puppeteer");
        const browser = await puppeteer.launch({
          headless: true,
          args: ["--no-sandbox", "--disable-setuid-sandbox"],
        });
        const page = await browser.newPage();
        await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });
        await page.waitForTimeout(2000);
        
        directPrices = await page.evaluate(() => {
          const allText = document.body.textContent || "";
          const prices: string[] = [];
          const priceRegex = /\$\s*([\d,]+\.\d{2})/g;
          let match;
          while ((match = priceRegex.exec(allText)) !== null) {
            prices.push(match[0]);
          }
          return prices;
        });
        
        await browser.close();
      } catch (e) {
        // Ignore
      }
    }

    return NextResponse.json({
      url,
      store,
      priceData,
      directPrices,
      htmlLength: html.length,
      scriptSnippets: scriptContents,
      hasNextData: html.includes('__NEXT_DATA__'),
      hasJsonLd: html.includes('application/ld+json'),
    });
  } catch (error) {
    console.error("Error in test scrape:", error);
    return NextResponse.json(
      { error: "Failed to scrape", details: String(error) },
      { status: 500 }
    );
  }
}
