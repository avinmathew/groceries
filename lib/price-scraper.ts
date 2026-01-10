import * as cheerio from "cheerio";
import puppeteer, { type Browser } from "puppeteer";

export type Store = "woolworths" | "coles" | "aldi";

export interface PriceData {
  regularPrice: number | null;
  discountPrice: number | null;
}

const SIX_DAYS_MS = 6 * 24 * 60 * 60 * 1000;

export function shouldRefreshPrice(lastRefreshed: Date | null): boolean {
  if (!lastRefreshed) return true;
  
  const now = new Date();
  // Find the most recent Wednesday
  const dayOfWeek = now.getDay(); // 0 = Sunday, 3 = Wednesday
  const daysSinceWednesday = (dayOfWeek - 3 + 7) % 7;
  const lastWednesday = new Date(now);
  lastWednesday.setDate(now.getDate() - daysSinceWednesday);
  lastWednesday.setHours(0, 0, 0, 0); // Set to start of day
  
  // Refresh if lastRefreshed is before the last Wednesday
  return lastRefreshed < lastWednesday;
}

// Reuse browser instance for better performance
let browserInstance: Browser | null = null;

async function getBrowser(): Promise<Browser> {
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
  }
  return browserInstance;
}

async function fetchWithPuppeteer(url: string, store: Store): Promise<{ html: string; prices?: { current?: string; was?: string } }> {
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    // Navigate to the page and wait for content to load
    await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });

    // Wait a bit for dynamic content (using setTimeout instead of deprecated waitForTimeout)
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Try to extract prices directly from the page using JavaScript
    let extractedPrices: { current?: string; was?: string } = {};
    
    if (store === "woolworths") {
      try {
        extractedPrices = await page.evaluate(() => {
          const result: { current?: string; was?: string } = {};
          
          // Try various selectors to find price - check all matching elements
          const selectors = [
            '[data-testid="product-price"]',
            '[data-testid="price"]',
            '[data-testid*="Price"]',
            '[data-testid*="price"]',
            '[class*="ProductPrice"]',
            '[class*="product-price"]',
            '[class*="Price"]',
            '[class*="price"]',
            'span[class*="price"]',
            'div[class*="price"]',
            'h2[class*="price"]',
            '[aria-label*="price"]',
            '[aria-label*="Price"]',
          ];
          
          // Try all selectors and all matching elements
          for (const selector of selectors) {
            const elements = document.querySelectorAll(selector);
            for (const element of Array.from(elements)) {
              const text = element.textContent?.trim() || "";
              // Check if it looks like a price (contains $ and numbers)
              if (text && /\$?\s*[\d,]+\.?\d*/.test(text)) {
                const priceMatch = text.match(/\$?\s*([\d,]+\.?\d*)/);
                if (priceMatch) {
                  const price = parseFloat(priceMatch[1].replace(/,/g, ""));
                  // Valid price range for groceries
                  if (price && price >= 0.01 && price <= 999.99) {
                    result.current = text;
                    break;
                  }
                }
              }
            }
            if (result.current) break;
          }
          
          // Try to find "was" price for sale items
          const wasSelectors = [
            '[data-testid*="was"]',
            '[data-testid*="Was"]',
            '[class*="WasPrice"]',
            '[class*="was-price"]',
            '[class*="original-price"]',
            '[class*="OriginalPrice"]',
            'span:contains("was")',
          ];
          
          for (const selector of wasSelectors) {
            try {
              const elements = document.querySelectorAll(selector);
              for (const element of Array.from(elements)) {
                const text = element.textContent?.trim() || "";
                if (text && /\$?\s*[\d,]+\.?\d*/.test(text)) {
                  const priceMatch = text.match(/\$?\s*([\d,]+\.?\d*)/);
                  if (priceMatch) {
                    const price = parseFloat(priceMatch[1].replace(/,/g, ""));
                    if (price && price >= 0.01 && price <= 999.99) {
                      result.was = text;
                      break;
                    }
                  }
                }
              }
              if (result.was) break;
            } catch (e) {
              // Skip invalid selectors
            }
          }
          
          // Also search page text for "was $X.XX" pattern
          if (!result.was) {
            const pageText = document.body.textContent || "";
            const wasMatch = pageText.match(/was\s*\$?\s*([\d,]+\.?\d*)/i);
            if (wasMatch) {
              const price = parseFloat(wasMatch[1].replace(/,/g, ""));
              if (price && price >= 0.01 && price <= 999.99) {
                result.was = wasMatch[0];
              }
            }
          }
          
          return result;
        });
      } catch (e) {
        console.error("Error extracting prices from page:", e);
      }
    } else if (store === "coles") {
      try {
        extractedPrices = await page.evaluate(() => {
          const result: { current?: string; was?: string } = {};
          
          // FIRST: Look specifically for .price__value class (the actual product price)
          const priceValueElement = document.querySelector('.price__value');
          
          if (priceValueElement) {
            const text = priceValueElement.textContent?.trim() || "";
            if (text && /\$?\s*[\d,]+\.?\d*/.test(text)) {
              const priceMatch = text.match(/\$?\s*([\d,]+\.?\d*)/);
              if (priceMatch) {
                const price = parseFloat(priceMatch[1].replace(/,/g, ""));
                if (price && price >= 0.01 && price <= 1000) {
                  result.current = text;
                }
              }
            }
          }
          
          // Look for "was" price - check for elements with "was" in class or text
          if (!result.was) {
            const productBuyContainer = document.querySelector('.coles-targeting-ProductBuyProductBuyContainer');
            if (productBuyContainer) {
              // Look for was price elements
              const wasElements = productBuyContainer.querySelectorAll('[class*="was"], [class*="Was"], [class*="original"]');
              for (const element of Array.from(wasElements)) {
                const text = element.textContent?.trim() || "";
                if (text && /\$?\s*[\d,]+\.?\d*/.test(text)) {
                  const priceMatch = text.match(/\$?\s*([\d,]+\.?\d*)/);
                  if (priceMatch) {
                    const price = parseFloat(priceMatch[1].replace(/,/g, ""));
                    if (price && price >= 0.01 && price <= 1000) {
                      result.was = text;
                      break;
                    }
                  }
                }
              }
              
              // Also check container text for "was $X.XX" pattern
              if (!result.was) {
                const containerText = productBuyContainer.textContent || "";
                const wasMatch = containerText.match(/was\s*\$?\s*([\d,]+\.?\d*)/i);
                if (wasMatch) {
                  const price = parseFloat(wasMatch[1].replace(/,/g, ""));
                  if (price && price >= 0.01 && price <= 1000) {
                    result.was = wasMatch[0];
                  }
                }
              }
            }
          }
          
          // FALLBACK: If .price__value not found, look in ProductBuyProductBuyContainer
          if (!result.current) {
            const productBuyContainer = document.querySelector('.coles-targeting-ProductBuyProductBuyContainer');
            
            if (productBuyContainer) {
              // Look for price elements, but EXCLUDE .price__calculation_method
              const priceElements = productBuyContainer.querySelectorAll('.price__value, [class*="price"]:not(.price__calculation_method), [data-price], [data-testid*="price"]');
              for (const element of Array.from(priceElements)) {
                // Skip if it's the calculation method class
                if (element.classList.contains('price__calculation_method')) {
                  continue;
                }
                
                const text = element.textContent?.trim() || "";
                if (text && /\$?\s*[\d,]+\.?\d*/.test(text) && !text.toLowerCase().includes("was")) {
                  const priceMatch = text.match(/\$?\s*([\d,]+\.?\d*)/);
                  if (priceMatch) {
                    const price = parseFloat(priceMatch[1].replace(/,/g, ""));
                    if (price && price >= 0.01 && price <= 1000) {
                      result.current = text;
                      break;
                    }
                  }
                }
              }
            }
          }
          
          // FALLBACK: If ProductBuyProductBuyContainer not found or no price extracted, try other selectors
          if (!result.current) {
            const priceSelectors = [
              '[data-testid="product-price"]',
              '[data-testid="price"]',
              '[class*="ProductPrice"]',
              '[class*="product-price"]',
              '[class*="current-price"]',
              '[class*="CurrentPrice"]',
              '[data-price]',
            ];
            
            const productArea = document.querySelector('main') || document.querySelector('[role="main"]') || document.body;
            
            for (const selector of priceSelectors) {
              try {
                const elements = productArea.querySelectorAll(selector);
                for (const element of Array.from(elements)) {
                  const text = element.textContent?.trim() || "";
                  if (text && /\$?\s*[\d,]+\.?\d*/.test(text) && !text.toLowerCase().includes("was")) {
                    const priceMatch = text.match(/\$?\s*([\d,]+\.?\d*)/);
                    if (priceMatch) {
                      const price = parseFloat(priceMatch[1].replace(/,/g, ""));
                      if (price && price >= 0.01 && price <= 50) {
                        result.current = text;
                        break;
                      }
                    }
                  }
                }
                if (result.current) break;
              } catch (e) {
                // Skip invalid selectors
              }
            }
          }
          
          return result;
        });
      } catch (e) {
        console.error("Error extracting Coles prices from page:", e);
      }
    } else if (store === "aldi") {
      try {
        extractedPrices = await page.evaluate(() => {
          const result: { current?: string; was?: string } = {};
          
          // Aldi typically shows price in format like "$0.72/0.18 kg" or "$3.99 per 1 kg"
          // Look for price patterns in the main product area
          const selectors = [
            'h1', // Product title area often has price nearby
            '[class*="price"]',
            '[class*="Price"]',
            '[data-testid*="price"]',
            '[data-testid*="Price"]',
            'main', // Main content area
            '[role="main"]',
          ];
          
          // Try all selectors
          for (const selector of selectors) {
            try {
              const elements = document.querySelectorAll(selector);
              for (const element of Array.from(elements)) {
                const text = element.textContent || "";
                // Match price patterns like "$0.72", "$3.99", "$12.50"
                // Look for the first reasonable price (between $0.01 and $999.99)
                const priceMatches = text.match(/\$\s*([\d,]+\.\d{2})/g);
                if (priceMatches) {
                  for (const match of priceMatches) {
                    const price = parseFloat(match.replace(/[$,]/g, ""));
                    if (price && price >= 0.01 && price <= 999.99) {
                      // Prefer prices that are standalone or near product info
                      // (not per kg prices which are usually higher)
                      // But accept any valid price if we haven't found one yet
                      if (!result.current || (price < 100)) {
                        result.current = match.trim();
                      }
                    }
                  }
                  if (result.current) break;
                }
              }
              if (result.current) break;
            } catch (e) {
              // Skip invalid selectors
            }
          }
          
          // If no price found with selectors, search the entire page body
          if (!result.current) {
            const bodyText = document.body.textContent || "";
            const priceMatches = bodyText.match(/\$\s*([\d,]+\.\d{2})/g);
            if (priceMatches) {
              // Find the first reasonable price (likely the main product price)
              for (const match of priceMatches) {
                const price = parseFloat(match.replace(/[$,]/g, ""));
                if (price && price >= 0.01 && price <= 999.99) {
                  result.current = match.trim();
                  break;
                }
              }
            }
          }
          
          return result;
        });
      } catch (e) {
        console.error("Error extracting Aldi prices from page:", e);
      }
    }

    // Get the fully rendered HTML
    const html = await page.content();
    await page.close();
    return { html, prices: extractedPrices };
  } catch (error) {
    await page.close();
    throw error;
  }
}

export async function scrapePrice(url: string, store: Store): Promise<PriceData> {
  try {
    // Use Puppeteer for JavaScript-rendered content
    const { html, prices: extractedPrices } = await fetchWithPuppeteer(url, store);
    const $ = cheerio.load(html);

    let result: PriceData;
    
    // If we extracted prices directly from the page, use those first
    if (extractedPrices?.current && (store === "woolworths" || store === "aldi" || store === "coles")) {
      const currentPrice = extractPrice(extractedPrices.current);
      const wasPrice = extractedPrices.was ? extractPrice(extractedPrices.was) : null;
      
      if (wasPrice && currentPrice && wasPrice > currentPrice) {
        // "was" price is higher than current, so current is the discount
        result = {
          regularPrice: wasPrice,
          discountPrice: currentPrice,
        };
      } else if (currentPrice) {
        // No "was" price or was price is same/lower (which shouldn't happen), so current is regular
        result = {
          regularPrice: currentPrice,
          discountPrice: null,
        };
      } else {
        // Fall back to HTML parsing
        if (store === "woolworths") {
          result = scrapeWoolworths($);
        } else if (store === "coles") {
          result = scrapeColes($);
        } else {
          result = scrapeAldi($);
        }
      }
    } else {
      // Use HTML parsing
      switch (store) {
        case "woolworths":
          result = scrapeWoolworths($);
          break;
        case "coles":
          result = scrapeColes($);
          break;
        case "aldi":
          result = scrapeAldi($);
          break;
        default:
          throw new Error(`Unsupported store: ${store}`);
      }
    }

    // Log for debugging
    if (!result.regularPrice && !result.discountPrice) {
      console.warn(`No price found for ${store} at ${url}`);
      console.log(`Extracted prices from page:`, extractedPrices);
    } else {
      console.log(`Successfully scraped ${store} price:`, result);
    }

    return result;
  } catch (error) {
    console.error(`Error scraping ${store} price from ${url}:`, error);
    return { regularPrice: null, discountPrice: null };
  }
}

function scrapeWoolworths($: any): PriceData {
  // Try multiple selectors for Woolworths prices
  let currentPriceText = "";
  let wasPriceText = "";

  // FIRST: Try JSON-LD structured data (most reliable for Woolworths)
  const jsonLdScripts = $('script[type="application/ld+json"]');
  jsonLdScripts.each((_index: number, el: cheerio.Element) => {
    try {
      const scriptContent = $(el).html() || "";
      const jsonLd = JSON.parse(scriptContent);
      
      // Handle Product type with offers
      if (jsonLd["@type"] === "Product") {
        if (jsonLd.offers) {
          // Handle both single offer object and array of offers
          const offers = Array.isArray(jsonLd.offers) ? jsonLd.offers : [jsonLd.offers];
          for (const offer of offers) {
            // Price can be a number directly in the offer
            if (offer.price !== undefined && offer.price !== null) {
              const price = typeof offer.price === "number" ? offer.price : parseFloat(String(offer.price));
              if (!isNaN(price) && price > 0) {
                currentPriceText = String(price);
                console.log(`Found price in JSON-LD offer: ${price}`);
              }
            }
            // Also check priceSpecification
            if (offer.priceSpecification?.value !== undefined && offer.priceSpecification.value !== null) {
              const price = typeof offer.priceSpecification.value === "number" 
                ? offer.priceSpecification.value 
                : parseFloat(String(offer.priceSpecification.value));
              if (!isNaN(price) && price > 0) {
                currentPriceText = String(price);
                console.log(`Found price in JSON-LD priceSpecification: ${price}`);
              }
            }
          }
        }
        // Direct price on Product
        if (jsonLd.price !== undefined && !currentPriceText) {
          const price = typeof jsonLd.price === "number" ? jsonLd.price : parseFloat(jsonLd.price);
          if (price && price > 0) {
            currentPriceText = String(price);
            console.log(`Found price in JSON-LD Product: ${price}`);
          }
        }
      }
      // Handle Offer type directly
      if (jsonLd["@type"] === "Offer" && !currentPriceText) {
        if (jsonLd.price !== undefined) {
          const price = typeof jsonLd.price === "number" ? jsonLd.price : parseFloat(jsonLd.price);
          if (price && price > 0) {
            currentPriceText = String(price);
            console.log(`Found price in JSON-LD Offer: ${price}`);
          }
        }
      }
    } catch (e) {
      console.error("Error parsing JSON-LD:", e);
    }
  });

  // SECOND: Try to find the price in the rendered DOM (now that JavaScript has executed)
  // Woolworths typically uses specific class names or data attributes
  const priceSelectors = [
    '[data-testid="product-price"]',
    '[data-testid="price"]',
    '[data-testid*="Price"]',
    '[data-testid*="price"]',
    '.product-price',
    '.price',
    '[class*="ProductPrice"]',
    '[class*="product-price"]',
    '[class*="Price"]',
    '[class*="price"]',
    'span[class*="price"]',
    'div[class*="price"]',
    'h2[class*="price"]',
    '[aria-label*="price"]',
    '[aria-label*="Price"]',
  ];

  for (const selector of priceSelectors) {
    try {
      const elements = $(selector);
      // Try all matching elements, not just the first
      for (let i = 0; i < elements.length; i++) {
        const element = $(elements[i]);
        const text = element.text().trim();
        if (text && extractPrice(text)) {
          const price = extractPrice(text);
          // Prefer prices that look like actual product prices (between $0.01 and $999.99)
          if (price && price >= 0.01 && price <= 999.99) {
            currentPriceText = text;
            break;
          }
        }
      }
      if (currentPriceText) break;
    } catch (e) {
      // Skip invalid selectors
    }
  }

  // Try to find "was" price for sale items
  const wasSelectors = [
    '[data-testid*="was"]',
    '[data-testid*="Was"]',
    '[class*="WasPrice"]',
    '[class*="was-price"]',
    '[class*="original-price"]',
    '[class*="OriginalPrice"]',
    '.was-price',
    '.original-price',
  ];

  for (const selector of wasSelectors) {
    try {
      const text = $(selector).first().text().trim();
      if (text && extractPrice(text)) {
        wasPriceText = text;
        break;
      }
    } catch (e) {
      // Skip invalid selectors
    }
  }

  // Also try to find embedded JSON data in script tags
  const scripts = $('script');
  scripts.each((_index: number, el: cheerio.Element) => {
    const scriptContent = $(el).html() || "";
    
    // Look for window.__NEXT_DATA__ or similar React/Next.js data
    if (scriptContent.includes('__NEXT_DATA__')) {
      try {
        // Match the entire __NEXT_DATA__ object (it can be very large)
        const nextDataMatch = scriptContent.match(/__NEXT_DATA__\s*=\s*({[\s\S]*?});?\s*(?:<|$)/);
        if (nextDataMatch) {
          try {
            const nextData = JSON.parse(nextDataMatch[1]);
            // Navigate through the data structure to find price
            const findPriceInObject = (obj: any, depth = 0): { price: string | null; wasPrice: string | null } => {
              if (depth > 10) return { price: null, wasPrice: null }; // Prevent infinite recursion
              if (typeof obj !== 'object' || obj === null) return { price: null, wasPrice: null };
              
              const result: { price: string | null; wasPrice: string | null } = { price: null, wasPrice: null };
              
              // Check for price fields
              if (obj.price && typeof obj.price === 'number' && obj.price > 0) {
                result.price = String(obj.price);
              }
              if (obj.currentPrice && typeof obj.currentPrice === 'number' && obj.currentPrice > 0) {
                result.price = String(obj.currentPrice);
              }
              if (obj.salePrice && typeof obj.salePrice === 'number' && obj.salePrice > 0) {
                result.price = String(obj.salePrice);
              }
              if (obj.wasPrice && typeof obj.wasPrice === 'number' && obj.wasPrice > 0) {
                result.wasPrice = String(obj.wasPrice);
              }
              if (obj.originalPrice && typeof obj.originalPrice === 'number' && obj.originalPrice > 0) {
                result.wasPrice = String(obj.originalPrice);
              }
              
              // Recursively search nested objects
              for (const key in obj) {
                if (key.toLowerCase().includes('price') || key.toLowerCase().includes('product')) {
                  const nested = findPriceInObject(obj[key], depth + 1);
                  if (nested.price && !result.price) result.price = nested.price;
                  if (nested.wasPrice && !result.wasPrice) result.wasPrice = nested.wasPrice;
                }
              }
              
              return result;
            };
            const found = findPriceInObject(nextData);
            if (found.price && !currentPriceText) currentPriceText = found.price;
            if (found.wasPrice && !wasPriceText) wasPriceText = found.wasPrice;
          } catch (e) {
            // If full parse fails, try to extract price values directly with regex
            const priceMatches = scriptContent.match(/"price"\s*:\s*([\d.]+)/g);
            if (priceMatches && !currentPriceText) {
              for (const match of priceMatches) {
                const price = match.match(/([\d.]+)/);
                if (price) {
                  currentPriceText = price[1];
                  break;
                }
              }
            }
          }
        }
      } catch (e) {
        // Ignore errors
      }
    }
    
    // Look for price data in embedded JSON
    if (scriptContent.includes('"price"') || scriptContent.includes("'price'") || scriptContent.includes('"Price"')) {
      try {
        // Try to extract JSON objects that might contain price - use a more greedy match
        const jsonMatches = scriptContent.match(/\{[^{}]*"price"[^{}]*\}/g) || 
                           scriptContent.match(/\{[^{}]*"Price"[^{}]*\}/g) ||
                           scriptContent.match(/\{[^{}]*"currentPrice"[^{}]*\}/g);
        if (jsonMatches) {
          for (const match of jsonMatches) {
            try {
              const obj = JSON.parse(match);
              if (obj.price) {
                currentPriceText = String(obj.price);
              }
              if (obj.currentPrice) {
                currentPriceText = String(obj.currentPrice);
              }
              if (obj.salePrice || obj.discountPrice) {
                currentPriceText = String(obj.salePrice || obj.discountPrice);
                if (obj.price && obj.price !== obj.salePrice) {
                  wasPriceText = String(obj.price);
                }
              }
              if (obj.wasPrice || obj.originalPrice) {
                wasPriceText = String(obj.wasPrice || obj.originalPrice);
              }
            } catch (e) {
              // Try to extract price value directly with multiple patterns
              const patterns = [
                /"price"\s*:\s*"?([\d.]+)"?/i,
                /"currentPrice"\s*:\s*"?([\d.]+)"?/i,
                /"salePrice"\s*:\s*"?([\d.]+)"?/i,
                /"Price"\s*:\s*"?([\d.]+)"?/i,
              ];
              for (const pattern of patterns) {
                const priceMatch = match.match(pattern);
                if (priceMatch && !currentPriceText) {
                  currentPriceText = priceMatch[1];
                }
              }
            }
          }
        }
      } catch (e) {
        // Ignore errors
      }
    }
  });

  // Try to extract price from data attributes
  if (!currentPriceText) {
    const dataPrice = $('[data-price]').attr('data-price') || 
                     $('[data-current-price]').attr('data-current-price') ||
                     $('[data-product-price]').attr('data-product-price');
    if (dataPrice) {
      currentPriceText = dataPrice;
    }
  }

  // Last resort: search entire HTML for price patterns
  if (!currentPriceText) {
    const fullHtml = $.html();
    // Look for common price patterns like "$0.76" or "$1.45" in the HTML
    const pricePatterns = [
      /\$\s*([\d,]+\.\d{2})/g,
      /"price"\s*:\s*"?([\d.]+)"?/gi,
      /"currentPrice"\s*:\s*"?([\d.]+)"?/gi,
      /"salePrice"\s*:\s*"?([\d.]+)"?/gi,
      /price[:\s]*\$?\s*([\d,]+\.\d{2})/gi,
    ];
    
    for (const pattern of pricePatterns) {
      const matches: RegExpMatchArray[] = [];
      const iterator = fullHtml.matchAll(pattern);
      for (const match of iterator) {
        matches.push(match);
      }
      for (const match of matches) {
        if (match && match.length > 0) {
          const matchText = (match[0] || match[1] || "") as string;
          const price = extractPrice(matchText);
          if (price && price > 0 && price < 1000) {
            currentPriceText = matchText;
            break;
          }
        }
      }
      if (currentPriceText) break;
    }
  }

  // Also look for price patterns in the page text for "was" price
  const pageText = $("body").text() || $("html").text() || "";
  const wasPriceMatch = pageText.match(/was\s*\$?\s*([\d,]+\.?\d*)/i);
  if (wasPriceMatch && !wasPriceText) {
    wasPriceText = wasPriceMatch[1];
  }

  const currentPrice = extractPrice(currentPriceText);
  const wasPrice = extractPrice(wasPriceText);

  // If there's a "was" price, then current price is the sale price
  if (wasPrice && currentPrice && wasPrice > currentPrice) {
    return {
      regularPrice: wasPrice,
      discountPrice: currentPrice,
    };
  }

  // Otherwise, current price is the regular price
  return {
    regularPrice: currentPrice,
    discountPrice: null,
  };
}

function scrapeColes($: any): PriceData {
  let currentPriceText = "";
  let wasPriceText = "";

  // FIRST: Look specifically for .price__value class (the actual product price)
  const priceValueElement = $('.price__value');
  
  if (priceValueElement.length > 0) {
    const text = priceValueElement.first().text().trim();
    if (text && extractPrice(text)) {
      const price = extractPrice(text);
      if (price && price >= 0.01 && price <= 1000) {
        currentPriceText = text;
      }
    }
  }
  
  // Look for "was" price - check for elements with "was" in class or text
  if (!wasPriceText) {
    const productBuyContainer = $('.coles-targeting-ProductBuyProductBuyContainer');
    if (productBuyContainer.length > 0) {
      // Look for was price elements
      const wasElements = productBuyContainer.find('[class*="was"], [class*="Was"], [class*="original"]');
      for (let i = 0; i < wasElements.length; i++) {
        const element = $(wasElements[i]);
        const text = element.text().trim();
        if (text && extractPrice(text)) {
          const price = extractPrice(text);
          if (price && price >= 0.01 && price <= 1000) {
            wasPriceText = text;
            break;
          }
        }
      }
      
      // Also check container text for "was $X.XX" pattern
      if (!wasPriceText) {
        const containerText = productBuyContainer.text() || "";
        const wasMatch = containerText.match(/was\s*\$?\s*([\d,]+\.?\d*)/i);
        if (wasMatch) {
          const price = extractPrice(wasMatch[1]);
          if (price && price >= 0.01 && price <= 1000) {
            wasPriceText = wasMatch[1];
          }
        }
      }
    }
  }
  
  // FALLBACK: If .price__value not found, look in ProductBuyProductBuyContainer
  if (!currentPriceText) {
    const productBuyContainer = $('.coles-targeting-ProductBuyProductBuyContainer');
    
    if (productBuyContainer.length > 0) {
      // Look for price elements, but EXCLUDE .price__calculation_method
      const priceElements = productBuyContainer.find('.price__value, [class*="price"]:not(.price__calculation_method), [data-price], [data-testid*="price"]');
      for (let i = 0; i < priceElements.length; i++) {
        const element = $(priceElements[i]);
        // Skip if it's the calculation method class
        if (element.hasClass('price__calculation_method')) {
          continue;
        }
        
        const text = element.text().trim();
        if (text && !text.toLowerCase().includes("was") && extractPrice(text)) {
          const price = extractPrice(text);
          if (price && price >= 0.01 && price <= 1000) {
            currentPriceText = text;
            break;
          }
        }
      }
    }
  }

  // SECOND: Try JSON-LD structured data (if ProductBuyProductBuyContainer didn't work)
  if (!currentPriceText) {
    const jsonLdScripts = $('script[type="application/ld+json"]');
    jsonLdScripts.each((_index: number, el: any) => {
      try {
        const scriptContent = $(el).html() || "";
        const jsonLd = JSON.parse(scriptContent);
        
        // Handle Product type with offers
        if (jsonLd["@type"] === "Product") {
          if (jsonLd.offers) {
            const offers = Array.isArray(jsonLd.offers) ? jsonLd.offers : [jsonLd.offers];
            for (const offer of offers) {
              if (offer.price !== undefined && offer.price !== null) {
                const price = typeof offer.price === "number" ? offer.price : parseFloat(String(offer.price));
                if (!isNaN(price) && price > 0 && price < 1000) {
                  currentPriceText = String(price);
                  console.log(`Found price in JSON-LD offer: ${price}`);
                }
              }
              if (offer.priceSpecification?.value !== undefined && offer.priceSpecification.value !== null) {
                const price = typeof offer.priceSpecification.value === "number" 
                  ? offer.priceSpecification.value 
                  : parseFloat(String(offer.priceSpecification.value));
                if (!isNaN(price) && price > 0 && price < 1000) {
                  currentPriceText = String(price);
                  console.log(`Found price in JSON-LD priceSpecification: ${price}`);
                }
              }
            }
          }
        }
      } catch (e) {
        // Ignore JSON parse errors
      }
    });
  }

  // THIRD: Try multiple selectors for Coles prices (if ProductBuyProductBuyContainer and JSON-LD didn't work)
  if (!currentPriceText) {
    // Try to find prices in the main product area first (more reliable)
    const mainArea = $('main').length > 0 ? $('main') : $('body');
    
    const priceSelectors = [
      '[data-testid="product-price"]',
      '[data-testid="price"]',
      '[class*="ProductPrice"]',
      '[class*="product-price"]',
      '[class*="current-price"]',
      '[class*="CurrentPrice"]',
      '[data-price]',
    ];

    // Collect all reasonable prices from main area
    const candidatePrices: { text: string; price: number }[] = [];
    
    for (const selector of priceSelectors) {
      try {
        const elements = mainArea.find(selector);
        for (let i = 0; i < elements.length; i++) {
          const element = $(elements[i]);
          const text = element.text().trim();
          // Skip if it contains "was" as it's likely a was price element
          if (text && !text.toLowerCase().includes("was") && extractPrice(text)) {
            const price = extractPrice(text);
            // Filter out very high prices that are likely errors
            // Most grocery items are under $50
            if (price && price >= 0.01 && price <= 50) {
              candidatePrices.push({ text, price });
            }
          }
        }
      } catch (e) {
        // Ignore errors
      }
    }
    
    // Sort by price (ascending) and take the lowest reasonable price
    if (candidatePrices.length > 0) {
      candidatePrices.sort((a, b) => a.price - b.price);
      currentPriceText = candidatePrices[0].text;
    }
  }

  // Also search page text for "was $X.XX" pattern (if not already found)
  if (!wasPriceText) {
    const pageText = $("body").text() || $("html").text() || "";
    const wasPriceMatch = pageText.match(/was\s*\$?\s*([\d,]+\.?\d*)/i);
    if (wasPriceMatch) {
      const price = extractPrice(wasPriceMatch[1]);
      if (price && price >= 0.01 && price <= 999.99) {
        wasPriceText = wasPriceMatch[1];
      }
    }
  }

  const currentPrice = extractPrice(currentPriceText);
  const wasPrice = extractPrice(wasPriceText);

  // If there's a "was" price that's higher than current, then current is the discount
  if (wasPrice && currentPrice && wasPrice > currentPrice) {
    return {
      regularPrice: wasPrice,
      discountPrice: currentPrice,
    };
  }

  // Otherwise, current price is the regular price (no discount)
  return {
    regularPrice: currentPrice,
    discountPrice: null,
  };
}

function scrapeAldi($: any): PriceData {
  // Aldi price selectors (these may need adjustment based on actual HTML structure)
  const priceText = $(".price").first().text().trim();
  const specialPriceText = $(".special-price").first().text().trim();

  const regularPrice = extractPrice(priceText);
  const discountPrice = specialPriceText ? extractPrice(specialPriceText) : null;

  return {
    regularPrice: discountPrice || regularPrice,
    discountPrice: discountPrice ? regularPrice : null,
  };
}

function extractPrice(text: string): number | null {
  if (!text) return null;
  // Extract number from price text (e.g., "$12.99" -> 12.99, "$1.45" -> 1.45, "0.76" -> 0.76)
  // Try to match decimal numbers with optional dollar sign and commas
  const match = text.match(/\$?\s*([\d,]+\.?\d*)/);
  if (!match) return null;
  const priceStr = match[1].replace(/,/g, "");
  const price = parseFloat(priceStr);
  return isNaN(price) ? null : price;
}
