import * as cheerio from "cheerio";
import puppeteer, { type Browser, type Page } from "puppeteer";

export type Store = "woolworths" | "coles" | "aldi";

export interface PriceData {
  regularPrice: number | null;
  discountPrice: number | null;
}

const SIX_DAYS_MS = 6 * 24 * 60 * 60 * 1000;

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
function parseJsonLd($: any): number | null {
  const jsonLdScripts = $('script[type="application/ld+json"]');
  
  for (let i = 0; i < jsonLdScripts.length; i++) {
    try {
      const scriptContent = $(jsonLdScripts[i]).html() || "";
      const jsonLd = JSON.parse(scriptContent);
      
      // Product type with offers
      if (jsonLd["@type"] === "Product") {
        if (jsonLd.offers) {
          const offers = Array.isArray(jsonLd.offers) ? jsonLd.offers : [jsonLd.offers];
          for (const offer of offers) {
            // Check if out of stock
            if (offer.availability) {
              const availability = String(offer.availability).toLowerCase();
              if (availability.includes('outofstock') || availability.includes('out of stock')) {
                return null;
              }
            }
            
            if (offer.price !== undefined && offer.price !== null) {
              const price = typeof offer.price === "number" ? offer.price : parseFloat(String(offer.price));
              if (!isNaN(price) && price > 0) return price;
            }
            if (offer.priceSpecification?.value !== undefined) {
              const price = typeof offer.priceSpecification.value === "number" 
                ? offer.priceSpecification.value 
                : parseFloat(String(offer.priceSpecification.value));
              if (!isNaN(price) && price > 0) return price;
            }
          }
        }
        if (jsonLd.price !== undefined) {
          const price = typeof jsonLd.price === "number" ? jsonLd.price : parseFloat(String(jsonLd.price));
          if (!isNaN(price) && price > 0) return price;
        }
      }
      
      // Direct Offer type
      if (jsonLd["@type"] === "Offer") {
        // Check if out of stock
        if (jsonLd.availability) {
          const availability = String(jsonLd.availability).toLowerCase();
          if (availability.includes('outofstock') || availability.includes('out of stock')) {
            return null;
          }
        }
        
        if (jsonLd.price !== undefined) {
          const price = typeof jsonLd.price === "number" ? jsonLd.price : parseFloat(String(jsonLd.price));
          if (!isNaN(price) && price > 0) return price;
        }
      }
    } catch (e) {
      // Skip invalid JSON-LD
    }
  }
  
  return null;
}

// Parse HTML with Cheerio using selectors
function parseHtmlForPrices($: any, config: StoreConfig): PriceData {
  let currentPrice: number | null = null;
  let wasPrice: number | null = null;

  // Try JSON-LD first (most reliable)
  currentPrice = parseJsonLd($);

  // Try CSS selectors
  if (!currentPrice) {
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
      await page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      );

      // Set localStorage before navigation if configured
      if (config.localStorage) {
        await page.evaluateOnNewDocument((localStorageData) => {
          Object.entries(localStorageData).forEach(([key, value]) => {
            localStorage.setItem(key, value);
          });
        }, config.localStorage);
      }

      await page.goto(url, { waitUntil: "networkidle0", timeout: 10000 });

      // Wait for price-related element to appear to ensure client-side pricing finished loading
      const waitSelector = config.containerSelectors?.[0] || config.priceSelectors[0];
      if (waitSelector) {
        try {
          await page.waitForSelector(waitSelector, { timeout: 10000 });
        } catch (e) {
          console.warn(`[Price Scraper] ${store} price selector not found within timeout: ${waitSelector}`);
        }
      }

      // Rate limit each store call
      await new Promise((resolve) => setTimeout(resolve, 5000));

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
      
      // Check for out of stock in JSON-LD (will return null if out of stock)
      const jsonLdPrice = parseJsonLd($);
      console.log(`[Price Scraper] ${store} JSON-LD price check:`, jsonLdPrice);
      if (jsonLdPrice === null) {
        // Check if null is due to out of stock vs no price data
        const bodyText = $('body').text().toLowerCase();
        if (bodyText.includes('out of stock') || 
            bodyText.includes('currently unavailable') ||
            bodyText.includes('temporarily unavailable')) {
          return { regularPrice: null, discountPrice: null };
        }
      }
      
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
