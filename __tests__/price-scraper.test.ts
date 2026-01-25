jest.mock("cheerio", () => ({ load: () => { throw new Error("cheerio mock not implemented"); } }), { virtual: true });

import { parseJsonLdForTest } from "@/lib/price-scraper";

// Minimal cheerio-like stub for JSON-LD parsing
function makeJsonLd$(json: unknown) {
  const jsonString = JSON.stringify(json);
  const element = { html: () => jsonString };
  const collection: any = { length: 1, 0: element };

  const $ = (input: any) => {
    if (input === 'script[type="application/ld+json"]') return collection;
    if (input === element) return { html: () => jsonString };
    return { html: () => '' };
  };

  return $ as any;
}

describe("parseJsonLd", () => {
  it("extracts Woolworths current price", () => {
    const woolworthsJson = {
      "@type": "Product",
      name: "Smith's Crinkle Cut Potato Chips Original 170g",
      offers: {
        "@type": "Offer",
        availability: "http://schema.org/InStock",
        price: 2.5,
        priceCurrency: "AUD",
        priceSpecification: {
          "@type": "UnitPriceSpecification",
          priceCurrency: "AUD",
          priceType: "https://schema.org/ListPrice",
          price: 1.47,
          unitText: "170g",
        },
      },
    };

    const $ = makeJsonLd$(woolworthsJson);
    const result = parseJsonLdForTest($);
    expect(result.current).toBe(2.5);
    expect(result.was).toBeNull();
  });

  it("extracts Coles current and list price", () => {
    const colesJson = {
      "@context": "https://schema.org",
      "@type": "Product",
      name: "Handee Ultra Paper Towels Crisp White | 2 pack",
      offers: [
        {
          "@type": "Offer",
          availability: "https://schema.org/InStock",
          price: 2.15,
          priceCurrency: "AUD",
          priceSpecification: {
            "@type": "UnitPriceSpecification",
            priceType: "https://schema.org/ListPrice",
            price: 4.3,
            priceCurrency: "AUD",
          },
        },
      ],
    };

    const $ = makeJsonLd$(colesJson);
    const result = parseJsonLdForTest($);
    expect(result.current).toBeCloseTo(2.15);
    expect(result.was).toBeCloseTo(4.3);
  });

  it("extracts Aldi price from offer string", () => {
    const aldiJson = {
      "@type": "Product",
      name: "Free Range Eggs 700g",
      offers: {
        "@type": "Offer",
        url: "https://www.aldi.com.au/product/lodge-farms-free-range-eggs-700g-000000000000405617",
        price: "6.19",
        priceCurrency: "AUD",
        availability: "https://schema.org/InStock",
      },
    };

    const $ = makeJsonLd$(aldiJson);
    const result = parseJsonLdForTest($);
    expect(result.current).toBeCloseTo(6.19);
    expect(result.was).toBeNull();
  });
});
