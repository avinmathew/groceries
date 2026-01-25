/**
 * Integration tests for refresh prices strategy
 * Tests: refreshPrices() with different scopes, strategy pattern
 */

import { POST } from '@/app/api/refresh-prices/route';
import { prisma } from '@/lib/db';
import { scrapePrice, shouldRefreshPrice } from '@/lib/price-scraper';
import { NextRequest } from 'next/server';

// Mock Prisma
jest.mock('@/lib/db', () => ({
  prisma: {
    groceryItem: {
      findUnique: jest.fn(),
    },
    productLink: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
    priceHistory: {
      create: jest.fn(),
    },
  },
}));

// Mock price scraper
jest.mock('@/lib/price-scraper', () => ({
  scrapePrice: jest.fn(),
  shouldRefreshPrice: jest.fn(),
  closeBrowser: jest.fn(),
}));

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const mockScrapePrice = scrapePrice as jest.MockedFunction<typeof scrapePrice>;
const mockShouldRefreshPrice = shouldRefreshPrice as jest.MockedFunction<typeof shouldRefreshPrice>;

describe('POST /api/refresh-prices - Single Item Strategy', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should refresh prices for a single grocery item', async () => {
    const mockItem = {
      id: '1',
      name: 'Apples',
      category: 'Fruits',
      createdAt: new Date(),
      updatedAt: new Date(),
      productLinks: [
        {
          id: 'link1',
          url: 'https://woolworths.com.au/shop/apples',
          store: 'Woolworths',
          regularPrice: null,
          discountPrice: null,
          lastRefreshed: null,
          groceryItemId: '1',
        },
      ],
    };

    const mockPriceData = {
      regularPrice: 4.5,
      discountPrice: null,
    };

    mockPrisma.groceryItem.findUnique.mockResolvedValue(mockItem);
    mockShouldRefreshPrice.mockReturnValue(true);
    mockScrapePrice.mockResolvedValue(mockPriceData);
    mockPrisma.productLink.update.mockResolvedValue({
      ...mockItem.productLinks[0],
      regularPrice: 4.5,
      lastRefreshed: new Date(),
    });
    mockPrisma.priceHistory.create.mockResolvedValue({} as any);

    const request = new NextRequest('http://localhost:3000/api/refresh-prices', {
      method: 'POST',
      body: JSON.stringify({ groceryItemId: '1' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockPrisma.groceryItem.findUnique).toHaveBeenCalledWith({
      where: { id: '1' },
      include: { productLinks: true },
    });
    expect(mockScrapePrice).toHaveBeenCalledWith('https://woolworths.com.au/shop/apples', 'Woolworths');
  });

  it('should skip links that dont need refresh for single item', async () => {
    const mockItem = {
      id: '1',
      name: 'Apples',
      category: 'Fruits',
      createdAt: new Date(),
      updatedAt: new Date(),
      productLinks: [
        {
          id: 'link1',
          url: 'https://woolworths.com.au/shop/apples',
          store: 'Woolworths',
          regularPrice: 4.5,
          discountPrice: null,
          lastRefreshed: new Date(),
          groceryItemId: '1',
        },
      ],
    };

    mockPrisma.groceryItem.findUnique.mockResolvedValue(mockItem);
    mockShouldRefreshPrice.mockReturnValue(false);

    const request = new NextRequest('http://localhost:3000/api/refresh-prices', {
      method: 'POST',
      body: JSON.stringify({ groceryItemId: '1' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(mockScrapePrice).not.toHaveBeenCalled();
  });

  it('should handle non-existent grocery item', async () => {
    mockPrisma.groceryItem.findUnique.mockResolvedValue(null);

    const request = new NextRequest('http://localhost:3000/api/refresh-prices', {
      method: 'POST',
      body: JSON.stringify({ groceryItemId: '999' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toContain('Failed to refresh prices');
  });
});

describe('POST /api/refresh-prices - Multiple Items Strategy', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should refresh prices for multiple grocery items', async () => {
    const mockLinks = [
      {
        id: 'link1',
        url: 'https://woolworths.com.au/shop/apples',
        store: 'Woolworths',
        regularPrice: null,
        discountPrice: null,
        lastRefreshed: null,
        groceryItemId: '1',
      },
      {
        id: 'link2',
        url: 'https://coles.com.au/bananas',
        store: 'Coles',
        regularPrice: null,
        discountPrice: null,
        lastRefreshed: null,
        groceryItemId: '2',
      },
    ];

    const mockPriceData = {
      regularPrice: 5.0,
      discountPrice: null,
    };

    mockPrisma.productLink.findMany.mockResolvedValue(mockLinks);
    mockScrapePrice.mockResolvedValue(mockPriceData);
    mockPrisma.productLink.update.mockResolvedValue({} as any);
    mockPrisma.priceHistory.create.mockResolvedValue({} as any);

    const request = new NextRequest('http://localhost:3000/api/refresh-prices', {
      method: 'POST',
      body: JSON.stringify({ groceryItemIds: ['1', '2'] }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockPrisma.productLink.findMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        groceryItemId: { in: ['1', '2'] },
      }),
    });
    expect(mockScrapePrice).toHaveBeenCalledTimes(2);
  });

  it('should handle empty groceryItemIds array', async () => {
    mockPrisma.productLink.findMany.mockResolvedValue([]);

    const request = new NextRequest('http://localhost:3000/api/refresh-prices', {
      method: 'POST',
      body: JSON.stringify({ groceryItemIds: [] }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
  });
});

describe('POST /api/refresh-prices - All Items Strategy', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should refresh all items when no parameters provided', async () => {
    const mockLinks = [
      {
        id: 'link1',
        url: 'https://woolworths.com.au/shop/apples',
        store: 'Woolworths',
        regularPrice: null,
        discountPrice: null,
        lastRefreshed: null,
        groceryItemId: '1',
      },
      {
        id: 'link2',
        url: 'https://coles.com.au/bananas',
        store: 'Coles',
        regularPrice: 3.5,
        discountPrice: null,
        lastRefreshed: new Date('2024-01-01'),
        groceryItemId: '2',
      },
    ];

    const mockPriceData = {
      regularPrice: 6.0,
      discountPrice: null,
    };

    mockPrisma.productLink.findMany.mockResolvedValue(mockLinks);
    mockScrapePrice.mockResolvedValue(mockPriceData);
    mockPrisma.productLink.update.mockResolvedValue({} as any);
    mockPrisma.priceHistory.create.mockResolvedValue({} as any);

    const request = new NextRequest('http://localhost:3000/api/refresh-prices', {
      method: 'POST',
      body: JSON.stringify({}),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockPrisma.productLink.findMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        OR: [
          { lastRefreshed: null },
          { lastRefreshed: expect.any(Object) },
        ],
      }),
    });
  });

  it('should only refresh links that need updating', async () => {
    const now = new Date();
    const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const mockLinks = [
      {
        id: 'link1',
        url: 'https://woolworths.com.au/shop/apples',
        store: 'Woolworths',
        regularPrice: null,
        discountPrice: null,
        lastRefreshed: null, // Should refresh - null
        groceryItemId: '1',
      },
      {
        id: 'link2',
        url: 'https://coles.com.au/bananas',
        store: 'Coles',
        regularPrice: 3.5,
        discountPrice: null,
        lastRefreshed: lastWeek, // Should refresh - old
        groceryItemId: '2',
      },
    ];

    const mockPriceData = {
      regularPrice: 4.0,
      discountPrice: null,
    };

    mockPrisma.productLink.findMany.mockResolvedValue(mockLinks);
    mockScrapePrice.mockResolvedValue(mockPriceData);
    mockPrisma.productLink.update.mockResolvedValue({} as any);
    mockPrisma.priceHistory.create.mockResolvedValue({} as any);

    const request = new NextRequest('http://localhost:3000/api/refresh-prices', {
      method: 'POST',
      body: JSON.stringify({}),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(mockScrapePrice).toHaveBeenCalledTimes(2);
  });
});

describe('POST /api/refresh-prices - Price History', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should create price history when price changes', async () => {
    const mockItem = {
      id: '1',
      name: 'Apples',
      category: 'Fruits',
      createdAt: new Date(),
      updatedAt: new Date(),
      productLinks: [
        {
          id: 'link1',
          url: 'https://woolworths.com.au/shop/apples',
          store: 'Woolworths',
          regularPrice: 4.0,
          discountPrice: null,
          lastRefreshed: new Date(),
          groceryItemId: '1',
        },
      ],
    };

    const mockPriceData = {
      regularPrice: 5.0, // Price changed from 4.0 to 5.0
      discountPrice: null,
    };

    mockPrisma.groceryItem.findUnique.mockResolvedValue(mockItem);
    mockShouldRefreshPrice.mockReturnValue(true);
    mockScrapePrice.mockResolvedValue(mockPriceData);
    mockPrisma.productLink.update.mockResolvedValue({} as any);
    mockPrisma.priceHistory.create.mockResolvedValue({} as any);

    const request = new NextRequest('http://localhost:3000/api/refresh-prices', {
      method: 'POST',
      body: JSON.stringify({ groceryItemId: '1' }),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(mockPrisma.priceHistory.create).toHaveBeenCalledWith({
      data: {
        productLinkId: 'link1',
        regularPrice: 5.0,
        discountPrice: null,
        recordedAt: expect.any(Date),
      },
    });
  });

  it('should create price history for first time price', async () => {
    const mockItem = {
      id: '1',
      name: 'Apples',
      category: 'Fruits',
      createdAt: new Date(),
      updatedAt: new Date(),
      productLinks: [
        {
          id: 'link1',
          url: 'https://woolworths.com.au/shop/apples',
          store: 'Woolworths',
          regularPrice: null, // No previous price
          discountPrice: null,
          lastRefreshed: null,
          groceryItemId: '1',
        },
      ],
    };

    const mockPriceData = {
      regularPrice: 4.5,
      discountPrice: null,
    };

    mockPrisma.groceryItem.findUnique.mockResolvedValue(mockItem);
    mockShouldRefreshPrice.mockReturnValue(true);
    mockScrapePrice.mockResolvedValue(mockPriceData);
    mockPrisma.productLink.update.mockResolvedValue({} as any);
    mockPrisma.priceHistory.create.mockResolvedValue({} as any);

    const request = new NextRequest('http://localhost:3000/api/refresh-prices', {
      method: 'POST',
      body: JSON.stringify({ groceryItemId: '1' }),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(mockPrisma.priceHistory.create).toHaveBeenCalledWith({
      data: {
        productLinkId: 'link1',
        regularPrice: 4.5,
        discountPrice: null,
        recordedAt: expect.any(Date),
      },
    });
  });
});

describe('POST /api/refresh-prices - Error Handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should handle scraping errors gracefully and continue', async () => {
    const mockItem = {
      id: '1',
      name: 'Apples',
      category: 'Fruits',
      createdAt: new Date(),
      updatedAt: new Date(),
      productLinks: [
        {
          id: 'link1',
          url: 'https://woolworths.com.au/shop/apples',
          store: 'Woolworths',
          regularPrice: null,
          discountPrice: null,
          lastRefreshed: null,
          groceryItemId: '1',
        },
      ],
    };

    mockPrisma.groceryItem.findUnique.mockResolvedValue(mockItem);
    mockShouldRefreshPrice.mockReturnValue(true);
    mockScrapePrice.mockRejectedValue(new Error('Network timeout'));

    const request = new NextRequest('http://localhost:3000/api/refresh-prices', {
      method: 'POST',
      body: JSON.stringify({ groceryItemId: '1' }),
    });

    const response = await POST(request);
    const data = await response.json();

    // Should continue gracefully even if scraping fails
    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
  });

  it('should handle invalid JSON in request body', async () => {
    const request = new NextRequest('http://localhost:3000/api/refresh-prices', {
      method: 'POST',
      body: 'invalid json',
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toContain('Failed to refresh prices');
  });
});
