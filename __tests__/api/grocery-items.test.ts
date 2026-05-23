/**
 * Integration tests for Grocery Items API routes
 * Tests: POST /api/grocery-items, GET/PATCH/DELETE /api/grocery-items/[id]
 */

import { POST } from '@/app/api/grocery-items/route';
import { GET, PATCH, DELETE } from '@/app/api/grocery-items/[id]/route';
import { prisma } from '@/lib/db';
import { NextRequest } from 'next/server';

// Mock Prisma
jest.mock('@/lib/db', () => ({
  prisma: {
    groceryItem: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    shoppingListItem: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    groceryUsage: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  },
}));

// Mock frequency module
jest.mock('@/lib/frequency', () => ({
  incrementUsage: jest.fn(),
}));

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

describe('POST /api/grocery-items', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should add item to shopping list with valid data', async () => {
    const mockGrocery = {
      id: 'g1',
      name: 'Test Item',
      category: null,
      productLinks: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const mockShoppingListItem = {
      id: 'sli1',
      quantity: 1,
      status: 'active',
      shoppingListId: 'list1',
      groceryItemId: 'g1',
      createdAt: new Date(),
      updatedAt: new Date(),
      groceryItem: mockGrocery,
    } as any;

    mockPrisma.groceryItem.findFirst.mockResolvedValue(null);
    mockPrisma.groceryItem.create.mockResolvedValue(mockGrocery as any);
    mockPrisma.shoppingListItem.findFirst.mockResolvedValue(null);
    mockPrisma.shoppingListItem.create.mockResolvedValue(mockShoppingListItem as any);

    const request = new NextRequest('http://localhost:3000/api/grocery-items', {
      method: 'POST',
      body: JSON.stringify({ name: 'Test Item', shoppingListId: 'list1', categoryId: null }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.data).toEqual(mockShoppingListItem);
  });

  it('should return validation error for missing name', async () => {
    const request = new NextRequest('http://localhost:3000/api/grocery-items', {
      method: 'POST',
      body: JSON.stringify({ shoppingListId: 'list1' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('Name is required');
  });

  it('should return validation error for invalid JSON', async () => {
    const request = new NextRequest('http://localhost:3000/api/grocery-items', {
      method: 'POST',
      body: 'invalid json',
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('Invalid request body');
  });

  it('should handle database errors gracefully', async () => {
    mockPrisma.groceryItem.findFirst.mockResolvedValue(null);
    mockPrisma.groceryItem.create.mockRejectedValue(new Error('Database connection failed'));

    const request = new NextRequest('http://localhost:3000/api/grocery-items', {
      method: 'POST',
      body: JSON.stringify({ name: 'Test Item', shoppingListId: 'list1' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toContain('Failed to add item to shopping list');
  });

  it('should set quantity to 1 when adding a new item', async () => {
    const mockGrocery = {
      id: 'g1',
      name: 'New Item',
      category: null,
      productLinks: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const mockShoppingListItem = {
      id: 'sli1',
      quantity: 1,
      status: 'active',
      shoppingListId: 'list1',
      groceryItemId: 'g1',
      createdAt: new Date(),
      updatedAt: new Date(),
      groceryItem: mockGrocery,
    } as any;

    mockPrisma.groceryItem.findFirst.mockResolvedValue(null);
    mockPrisma.groceryItem.create.mockResolvedValue(mockGrocery as any);
    mockPrisma.shoppingListItem.findFirst.mockResolvedValue(null);
    mockPrisma.shoppingListItem.create.mockResolvedValue(mockShoppingListItem as any);

    const request = new NextRequest('http://localhost:3000/api/grocery-items', {
      method: 'POST',
      body: JSON.stringify({ name: 'New Item', shoppingListId: 'list1' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(mockPrisma.shoppingListItem.create).toHaveBeenCalledWith({
      data: {
        groceryItemId: 'g1',
        shoppingListId: 'list1',
        quantity: 1,
      },
      include: {
        groceryItem: {
          include: {
            category: true,
            productLinks: true,
          },
        },
      },
    });
  });

  it('should increase quantity by 1 when adding an existing uncrossed item', async () => {
    const mockGrocery = {
      id: 'g1',
      name: 'Existing Item',
      category: null,
      productLinks: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const existingShoppingListItem = {
      id: 'sli1',
      quantity: 2,
      status: 'active',
      completedAt: null,
      shoppingListId: 'list1',
      groceryItemId: 'g1',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const updatedShoppingListItem = {
      ...existingShoppingListItem,
      quantity: 3,
      groceryItem: mockGrocery,
    } as any;

    mockPrisma.groceryItem.findFirst.mockResolvedValue(mockGrocery as any);
    mockPrisma.shoppingListItem.findFirst.mockResolvedValue(existingShoppingListItem as any);
    mockPrisma.shoppingListItem.update.mockResolvedValue(updatedShoppingListItem as any);

    const request = new NextRequest('http://localhost:3000/api/grocery-items', {
      method: 'POST',
      body: JSON.stringify({ name: 'Existing Item', shoppingListId: 'list1' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(mockPrisma.shoppingListItem.update).toHaveBeenCalledWith({
      where: { id: 'sli1' },
      data: {
        status: 'active',
        completedAt: null,
        quantity: 3,
      },
      include: {
        groceryItem: {
          include: {
            category: true,
            productLinks: true,
          },
        },
      },
    });
    expect(data.data.quantity).toBe(3);
  });

  it('should not change quantity when adding an existing crossed-off item', async () => {
    const mockGrocery = {
      id: 'g1',
      name: 'Crossed Off Item',
      category: null,
      productLinks: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const existingShoppingListItem = {
      id: 'sli1',
      quantity: 3,
      status: 'completed',
      completedAt: new Date(),
      shoppingListId: 'list1',
      groceryItemId: 'g1',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const updatedShoppingListItem = {
      ...existingShoppingListItem,
      status: 'active',
      completedAt: null,
      groceryItem: mockGrocery,
    } as any;

    mockPrisma.groceryItem.findFirst.mockResolvedValue(mockGrocery as any);
    mockPrisma.shoppingListItem.findFirst.mockResolvedValue(existingShoppingListItem as any);
    mockPrisma.shoppingListItem.update.mockResolvedValue(updatedShoppingListItem as any);

    const request = new NextRequest('http://localhost:3000/api/grocery-items', {
      method: 'POST',
      body: JSON.stringify({ name: 'Crossed Off Item', shoppingListId: 'list1' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(mockPrisma.shoppingListItem.update).toHaveBeenCalledWith({
      where: { id: 'sli1' },
      data: {
        status: 'active',
        completedAt: null,
      },
      include: {
        groceryItem: {
          include: {
            category: true,
            productLinks: true,
          },
        },
      },
    });
    // Quantity should remain 3, not incremented
    expect(data.data.quantity).toBe(3);
  });
});

describe('GET /api/grocery-items/[id]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return grocery item with valid id', async () => {
    const mockItem = {
      id: '1',
      name: 'Test Item',
      category: 'Fruits',
      createdAt: new Date(),
      updatedAt: new Date(),
      productLinks: [],
    };

    mockPrisma.shoppingListItem.findUnique.mockResolvedValue(null as any);
    mockPrisma.groceryItem.findUnique.mockResolvedValue(mockItem);

    const request = new NextRequest('http://localhost:3000/api/grocery-items/1');
    const response = await GET(request, { params: { id: '1' } });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.data).toEqual(mockItem);
    expect(mockPrisma.groceryItem.findUnique).toHaveBeenCalledWith({
      where: { id: '1' },
      include: { category: true, productLinks: true, shoppingListItems: true },
    });
  });

  it('should return 404 for non-existent item', async () => {
    mockPrisma.groceryItem.findUnique.mockResolvedValue(null);

    const request = new NextRequest('http://localhost:3000/api/grocery-items/999');
    const response = await GET(request, { params: { id: '999' } });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toContain('Grocery item not found');
  });
});

describe('PATCH /api/grocery-items/[id]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should update grocery item with valid data', async () => {
    const mockItem = {
      id: '1',
      name: 'Updated Item',
      category: 'Vegetables',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    mockPrisma.shoppingListItem.update.mockResolvedValue({ id: '1', groceryItemId: '1', quantity: 1, groceryItem: {} } as any);
    mockPrisma.groceryItem.update.mockResolvedValue(mockItem);

    const request = new NextRequest('http://localhost:3000/api/grocery-items/1', {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Updated Item' }),
    });

    const response = await PATCH(request, { params: { id: '1' } });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(response.status).toBe(200);
    expect(data.data).toEqual({ id: '1', groceryItemId: '1', quantity: 1, groceryItem: {} });
    expect(mockPrisma.groceryItem.update).toHaveBeenCalledWith({
      where: { id: '1' },
      data: { name: 'Updated Item' },
    });
  });

  it('should return 500 when updating non-existent item', async () => {
    mockPrisma.groceryItem.update.mockRejectedValue(new Error('Record not found'));

    const request = new NextRequest('http://localhost:3000/api/grocery-items/999', {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Updated Item' }),
    });

    const response = await PATCH(request, { params: { id: '999' } });
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toContain('Failed to update shopping list item');
  });

  it('should accept empty name updates', async () => {
    const updatedSli = { id: '1', groceryItemId: '1', quantity: 1, groceryItem: { name: '' } } as any;
    mockPrisma.shoppingListItem.update.mockResolvedValue(updatedSli);
    mockPrisma.groceryItem.update.mockResolvedValue({ id: '1', name: '' } as any);

    const request = new NextRequest('http://localhost:3000/api/grocery-items/1', {
      method: 'PATCH',
      body: JSON.stringify({ name: '' }),
    });

    const response = await PATCH(request, { params: { id: '1' } });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.data.groceryItem.name).toBe('');
  });

  it('should update shopping list item to later without preserving completedAt', async () => {
    const updatedSli = {
      id: '1',
      groceryItemId: 'g1',
      quantity: 1,
      status: 'later',
      completedAt: null,
      groceryItem: {},
    } as any;

    mockPrisma.shoppingListItem.update.mockResolvedValue(updatedSli);

    const request = new NextRequest('http://localhost:3000/api/grocery-items/1', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'later' }),
    });

    const response = await PATCH(request, { params: { id: '1' } });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.data.status).toBe('later');
    expect(mockPrisma.shoppingListItem.update).toHaveBeenCalledWith({
      where: { id: '1' },
      data: {
        status: 'later',
        completedAt: null,
      },
      include: {
        groceryItem: {
          include: {
            category: true,
            productLinks: true,
          },
        },
      },
    });
  });
});

describe('DELETE /api/grocery-items/[id]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should delete grocery item with valid id', async () => {
    mockPrisma.groceryItem.delete.mockResolvedValue({} as any);
    mockPrisma.groceryItem.findUnique.mockResolvedValue({ id: '1' } as any);

    const request = new NextRequest('http://localhost:3000/api/grocery-items/1?scope=all');
    const response = await DELETE(request, { params: { id: '1' } });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.message).toContain('deleted from all lists');
    expect(mockPrisma.groceryItem.delete).toHaveBeenCalledWith({
      where: { id: '1' },
    });
  });

  it('should return 500 when deleting non-existent item', async () => {
    mockPrisma.groceryItem.findUnique.mockResolvedValue({ id: '1' } as any);
    mockPrisma.groceryItem.delete.mockRejectedValue(new Error('Record not found'));

    const request = new NextRequest('http://localhost:3000/api/grocery-items/999?scope=all');
    const response = await DELETE(request, { params: { id: '999' } });
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toContain('Failed to delete shopping list item');
  });

  it('should handle cascade delete constraints', async () => {
    mockPrisma.groceryItem.findUnique.mockResolvedValue({ id: '1' } as any);
    mockPrisma.groceryItem.delete.mockRejectedValue(
      new Error('Foreign key constraint failed')
    );

    const request = new NextRequest('http://localhost:3000/api/grocery-items/1?scope=all');
    const response = await DELETE(request, { params: { id: '1' } });
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toContain('Failed to delete shopping list item');
  });
});

