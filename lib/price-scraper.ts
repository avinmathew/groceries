import * as cheerio from "cheerio";
import puppeteer, { type Browser, type Page } from "puppeteer";
import { promises as fs } from "fs";
import path from "path";

export type Store = "woolworths" | "coles" | "aldi";

export interface PriceData {
  regularPrice: number | null;
  discountPrice: number | null;
}

const DEBUG_DIR = path.join(process.cwd(), "tmp", "scraper-debug");

export function shouldRefreshPrice(lastRefreshed: Date | null): boolean {
  if (!lastRefreshed) return true;
  
  const now = new Date();
  const dayOfWeek = now.getDay();
  const daysSinceWednesday = (dayOfWeek - 3 + 7) % 7;
  const lastWednesday = new Date(now);
  lastWednesday.setDate(now.getDate() - daysSinceWednesday);
  lastWednesday.setHours(0, 0, 0, 0);
  
  return lastRefreshed < lastWednesday;
}

// Browser instance management
let browserInstance: Browser | null = null;
let browserLastUsed: number = Date.now();
const BROWSER_TIMEOUT_MS = 5 * 60 * 1000;

async function saveDebugArtifacts(page: Page, store: Store, reason: string) {
  try {
    await fs.mkdir(DEBUG_DIR, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const baseName = `${store}-${reason}-${timestamp}`;
    const htmlPath = path.join(DEBUG_DIR, `${baseName}.html`);
    const screenshotPath = path.join(DEBUG_DIR, `${baseName}.png`);

    const html = await page.content();
    await fs.writeFile(htmlPath, html, "utf8");
    await page.screenshot({ path: screenshotPath, fullPage: true });

    console.warn(`[Price Scraper] Saved debug HTML to ${htmlPath}`);
    console.warn(`[Price Scraper] Saved debug screenshot to ${screenshotPath}`);

    return { htmlPath, screenshotPath };
  } catch (error) {
    console.error(`[Price Scraper] Failed to save debug artifacts (${reason}):`, error);
    return null;
  }
}

async function getBrowser(): Promise<Browser> {
  if (browserInstance && Date.now() - browserLastUsed > BROWSER_TIMEOUT_MS) {
    await closeBrowser();
  }

  if (!browserInstance) {
    browserInstance = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--no-first-run",
        "--no-zygote",
        "--disable-gpu",
        "--disable-blink-features=AutomationControlled", // Hide automation
        "--disable-features=IsolateOrigins,site-per-process",
      ],
    });

    browserInstance.on('disconnected', () => {
      browserInstance = null;
    });
  }

  browserLastUsed = Date.now();
  return browserInstance;
}

export async function closeBrowser(): Promise<void> {
  if (browserInstance) {
    try {
      await browserInstance.close();
    } catch (error) {
      console.error('Error closing browser:', error);
    } finally {
      browserInstance = null;
    }
  }
}

if (typeof process !== 'undefined') {
  const shutdown = async () => {
    await closeBrowser();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

// Store-specific configurations
interface StoreConfig {
  name: Store;
  priceSelectors: string[];
  wasSelectors: string[];
  containerSelectors?: string[];
  priceRange: { min: number; max: number };
  localStorage?: Record<string, string>;
}

const STORE_CONFIGS: Record<Store, StoreConfig> = {
  woolworths: {
    name: "woolworths",
    priceSelectors: [
      '[aria-labelledby="product-price-sr"]',
    ],
    wasSelectors: [
      '[aria-labelledby="product-was-price-sr"]',
    ],
    containerSelectors: [
      '#product-details-panel',
    ],
    priceRange: { min: 0.01, max: 99.99 },
    localStorage: {
      "shopper_data": '{"profile.cart.TotalItems":"0","profile.FulfilmentStoreID":"2762","profile.ProfileLoggedInStatus":"YES","cart.TotalValue":"0","cart.TotalItems":"0","user.ProfileLoggedInStatus":"YES","page.Pathname":"/","profile.ShopperID":"715684","profile.ProfileOrderCount":"0","user.SubscriptionIsFreeTrialEligible":"YES","profile.IsFreeTrialSubscriptionEligible":"YES","user.SubscriptionType":null,"user.SubscriptionEndDate":"","order.DeliveryState":"QLD","checkout.DeliveryMethod":"Courier"}',
      "shopper_details": '{"orderCount":0,"fulfilmentStoreId":2762}'
    },
  },
  coles: {
    name: "coles",
    priceSelectors: [
      '.price__value',
      '[data-testid="pricing"]',
    ],
    wasSelectors: [
      '.price__was',
    ],
    containerSelectors: [
      '.coles-targeting-ProductBuyProductBuyContainer',
    ],
    priceRange: { min: 0.01, max: 99.99 },
    localStorage: {
      shoppingMethod: '{"address":"Corner Calam Road and Compton Road, Sunnybank Hills","addressId":null,"currentFulfilmentStoreId":"4671","geolocationStatus":null,"locationId":"4671CC4671","remoteProvider":null,"locationName":"Coles Sunnybank Hills","postcode":"4109","qasAddressId":null,"region":"c-qld-met","selectedFulfilmentStoreId":"4671","shoppingMethod":"clickAndCollect","state":"QLD","storeId":"4671","suburb":"Sunnybank Hills","isAuthenticated":false,"showShoppingMethodPrompt":false,"storeRestrictions":{"isLiquorSold":false,"isTobaccoSold":true},"location":{"latitude":-27.611238,"longitude":153.055551}}',
    },
  },
  aldi: {
    name: "aldi",
    priceSelectors: [
      '.base-price__regular',
    ],
    wasSelectors: [
    ],
    containerSelectors: [
      '.product-details__buying-area',
    ],
    priceRange: { min: 0.01, max: 99.99 },
    localStorage: {
      "merchant-selection": '{"confirmedByUser":true,"merchantId":"G132","service":"walk-in"}',
    },
  },
};

// Extract price from text
function extractPrice(text: string): number | null {
  const priceMatch = text.match(/\$?\s*([\d,]+\.?\d*)/);
  if (priceMatch) {
    const price = parseFloat(priceMatch[1].replace(/,/g, ""));
    return !isNaN(price) && price > 0 ? price : null;
  }
  return null;
}

// Generic price extraction from page using JavaScript
async function extractPricesFromPage(page: Page, config: StoreConfig): Promise<{ current?: string; was?: string; }> {
  try {
    return await page.evaluate((cfg) => {
      const result: { current?: string; was?: string; } = {};
    
      // Helper to check if text contains a valid price
      const isValidPrice = (text: string, min: number, max: number): boolean => {
        if (!text || !/\$?\s*[\d,]+\.?\d*/.test(text)) return false;
        const priceMatch = text.match(/\$?\s*([\d,]+\.?\d*)/);
        if (!priceMatch) return false;
        const price = parseFloat(priceMatch[1].replace(/,/g, ""));
        return price >= min && price <= max;
      };

      // Search in containers first if specified
      const searchAreas: Element[] = [];
      if (cfg.containerSelectors) {
        cfg.containerSelectors.forEach(selector => {
          const container = document.querySelector(selector);
          if (container) searchAreas.push(container);
        });
      }
      if (searchAreas.length === 0) {
        searchAreas.push(document.body);
      }

      // Find current price
      for (const area of searchAreas) {
        for (const selector of cfg.priceSelectors) {
          const elements = area.querySelectorAll(selector);
          for (const element of Array.from(elements)) {
            const text = element.textContent?.trim() || "";
            if (isValidPrice(text, cfg.priceRange.min, cfg.priceRange.max)) {
              result.current = text;
              break;
            }
          }
          if (result.current) break;
        }
        if (result.current) break;
      }

      // Find "was" price
      if (cfg.wasSelectors.length > 0) {
        for (const area of searchAreas) {
          for (const selector of cfg.wasSelectors) {
            const elements = area.querySelectorAll(selector);
            for (const element of Array.from(elements)) {
              const text = element.textContent?.trim() || "";
              if (isValidPrice(text, cfg.priceRange.min, cfg.priceRange.max)) {
                result.was = text;
                break;
              }
            }
            if (result.was) break;
          }
          if (result.was) break;
        }
      }

      return result;
    }, config);
  } catch (e) {
    console.error(`Error extracting prices for ${config.name}:`, e);
    return {};
  }
}


// Parse JSON-LD structured data
export interface JsonLdResult {
  current: number | null;
  was: number | null;
}

function parseJsonLd($: any): JsonLdResult {
  const result: JsonLdResult = { current: null, was: null };
  const jsonLdScripts = $('script[type="application/ld+json"]');

  const toNumber = (val: unknown): number | null => {
    if (val === undefined || val === null) return null;
    const n = typeof val === 'number' ? val : parseFloat(String(val));
    return isNaN(n) ? null : n;
  };

  const processOffer = (offer: any) => {
    if (!offer) return;

    const price = toNumber(offer.price);
    // PriceSpecification can be unit price or list price depending on store
    const ps = offer.priceSpecification;
    const psPrice = ps ? toNumber(ps.price ?? ps.value) : null;
    const psType = ps?.priceType ? String(ps.priceType).toLowerCase() : '';
    const isListPrice = psType.includes('listprice');

    // Current price
    if (price && price > 0) {
      // Prefer the first encountered current price
      if (result.current === null) result.current = price;
    }

    // Original/List price: only trust priceSpecification if it's flagged as ListPrice
    if (isListPrice && psPrice && psPrice > 0) {
      // Avoid unit prices by ensuring it's not lower than current
      if (result.current && psPrice >= result.current) {
        result.was = psPrice;
      } else if (!result.current) {
        // If current not known yet, keep as potential was; we'll reconcile later
        result.was = psPrice;
      }
    }
  };

  const processJsonObject = (obj: any) => {
    if (!obj || typeof obj !== 'object') return;

    const type = obj['@type'];

    if (type === 'Product') {
      if (obj.offers) {
        const offers = Array.isArray(obj.offers) ? obj.offers : [obj.offers];
        for (const offer of offers) processOffer(offer);
      }
      // Fallback: product-level price (rare)
      if (result.current === null && obj.price !== undefined) {
        const p = toNumber(obj.price);
        if (p && p > 0) result.current = p;
      }
    } else if (type === 'Offer') {
      processOffer(obj);
    }
  };

  for (let i = 0; i < jsonLdScripts.length; i++) {
    try {
      const scriptContent = $(jsonLdScripts[i]).html() || '';
      const parsed = JSON.parse(scriptContent);
      if (Array.isArray(parsed)) {
        for (const item of parsed) processJsonObject(item);
      } else {
        processJsonObject(parsed);
      }
    } catch {
      // Skip invalid JSON-LD blocks
      continue;
    }
  }

  return result;
}

// Testing helper
export function parseJsonLdForTest($: any): JsonLdResult {
  return parseJsonLd($);
}

// Parse HTML with Cheerio using selectors
function parseHtmlForPrices($: any, config: StoreConfig): PriceData {
  let currentPrice: number | null = null;
  let wasPrice: number | null = null;

  // Try CSS selectors
  for (const selector of config.priceSelectors) {
    try {
      const elements = $(selector);
      for (let i = 0; i < elements.length; i++) {
        const text = $(elements[i]).text().trim();
        const price = extractPrice(text);
        if (price && price >= config.priceRange.min && price <= config.priceRange.max) {
          currentPrice = price;
          break;
        }
      }
      if (currentPrice) break;
    } catch (e) {
      // Skip invalid selectors
    }
  }

  // Find "was" price
  for (const selector of config.wasSelectors) {
    try {
      const text = $(selector).first().text().trim();
      const price = extractPrice(text);
      if (price && price >= config.priceRange.min && price <= config.priceRange.max) {
        wasPrice = price;
        break;
      }
    } catch (e) {
      // Skip invalid selectors
    }
  }

  // Determine regular vs discount price
  if (wasPrice && currentPrice && wasPrice > currentPrice) {
    return { regularPrice: wasPrice, discountPrice: currentPrice };
  }
  
  return { regularPrice: currentPrice, discountPrice: null };
}

  // Coles sometimes serves an error shell but still embeds pricing inside __NEXT_DATA__
  function parseColesNextData($: any): PriceData | null {
    const script = $("#__NEXT_DATA__").html();
    if (!script) return null;

    try {
      const data = JSON.parse(script);
      const pricing = data?.props?.pageProps?.product?.pricing;
      if (!pricing) return null;

      const current = typeof pricing.now === "number" ? pricing.now : extractPrice(String(pricing.now ?? ""));
      const was = typeof pricing.was === "number" ? pricing.was : extractPrice(String(pricing.was ?? ""));

      if (current && was && was > current) {
        return { regularPrice: was, discountPrice: current };
      }
      if (current) {
        return { regularPrice: current, discountPrice: null };
      }
      if (was) {
        return { regularPrice: was, discountPrice: null };
      }

      return null;
    } catch (error) {
      console.warn("[Price Scraper] Failed to parse Coles __NEXT_DATA__", error);
      return null;
    }
  }

// Main scraping function
export async function scrapePrice(url: string, store: Store): Promise<PriceData> {
  console.log(`[Price Scraper] Starting scrape for ${store}: ${url}`);
  
  const config = STORE_CONFIGS[store];
  if (!config) {
    throw new Error(`Unsupported store: ${store}`);
  }

  try {
    const browser = await getBrowser();
    const page = await browser.newPage();

    try {
      // Set realistic viewport and headers to avoid bot detection
      await page.setViewport({ width: 1920, height: 1080 });
      await page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36"
      );
      await page.setExtraHTTPHeaders({
        'Accept': '*/*',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Priority': 'u=1, i',
        'Sec-Ch-Ua': '"Not(A:Brand";v="8", "Chromium";v="144", "Google Chrome";v="144"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin',
      });

      // Hide automation indicators
      await page.evaluateOnNewDocument(() => {
          delete Object.getPrototypeOf(navigator).webdriver;
      });

      // Set localStorage before navigation if configured
      if (config.localStorage) {
        await page.evaluateOnNewDocument((localStorageData) => {
          Object.entries(localStorageData).forEach(([key, value]) => {
            localStorage.setItem(key, value);
          });
        }, config.localStorage);
      }

      console.log(`[Price Scraper] ${store} Navigating to URL...`);
      const startTime = Date.now();
      
      // Use networkidle2 instead of networkidle0 - more forgiving for sites with persistent connections
      // domcontentloaded is also an option for faster loading
      await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });
      
      console.log(`[Price Scraper] ${store} Page loaded in ${Date.now() - startTime}ms`);

      // Wait for price-related element to appear to ensure client-side pricing finished loading
      const waitSelector = config.containerSelectors?.[0] || config.priceSelectors[0];
      if (waitSelector) {
        try {
          await page.waitForSelector(waitSelector, { timeout: 10000 });
        } catch (e) {
          console.warn(`[Price Scraper] ${store} price selector not found within timeout: ${waitSelector}`);
          await saveDebugArtifacts(page, store, "selector-timeout");
        }
      }

      // Extract prices from rendered page
      const extractedPrices = await extractPricesFromPage(page, config);
      console.log(`[Price Scraper] ${store} Extracted from page:`, extractedPrices);
      
      // Get HTML for fallback parsing
      const html = await page.content();
      await page.close();

      // Process extracted prices
      if (extractedPrices.current) {
        const currentPrice = extractPrice(extractedPrices.current);
        const wasPrice = extractedPrices.was ? extractPrice(extractedPrices.was) : null;

        if (wasPrice && currentPrice && wasPrice > currentPrice) {
          const result = { regularPrice: wasPrice, discountPrice: currentPrice };
          console.log(`[Price Scraper] ${store} ✓ Found discount price:`, result);
          return result;
        }
        if (currentPrice) {
          const result = { regularPrice: currentPrice, discountPrice: null };
          console.log(`[Price Scraper] ${store} ✓ Found regular price:`, result);
          return result;
        }
      }

      // Fallback to HTML parsing
      console.log(`[Price Scraper] ${store} Falling back to HTML parsing`);
      const $ = cheerio.load(html);
      
      // Check for JSON-LD to extract prices
      const jsonLdData = parseJsonLd($);
      console.log(`[Price Scraper] ${store} JSON-LD check:`, jsonLdData);

      // If JSON-LD already provides pricing, return immediately
      if (jsonLdData.current !== null || jsonLdData.was !== null) {
        const hasDiscount = jsonLdData.was !== null && jsonLdData.current !== null && jsonLdData.was > jsonLdData.current;
        if (hasDiscount) {
          return { regularPrice: jsonLdData.was!, discountPrice: jsonLdData.current! };
        }
        const price = jsonLdData.current ?? jsonLdData.was;
        return { regularPrice: price, discountPrice: null };
      }

      // Coles: fallback to __NEXT_DATA__ when the UI shell shows an error but data is present
      if (store === "coles") {
        const nextDataPrices = parseColesNextData($);
        if (nextDataPrices) {
          console.log(`[Price Scraper] ${store} Parsed pricing from __NEXT_DATA__`, nextDataPrices);
          return nextDataPrices;
        }
      }
      
      // Otherwise check HTML selectors
      const result = parseHtmlForPrices($, config);
      console.log(`[Price Scraper] ${store} HTML parsing result:`, result);

      return result.regularPrice || result.discountPrice ? result : { regularPrice: null, discountPrice: null };
    } catch (error) {
      await page.close();
      throw error;
    }
  } catch (error) {
    console.error(`Error scraping ${store} price from ${url}:`, error);
    return { regularPrice: null, discountPrice: null };
  }
}
