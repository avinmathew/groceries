/**
 * Integration tests for Shopping Lists API routes
 * Tests: GET/POST /api/shopping-lists, GET/PATCH/DELETE /api/shopping-lists/[id]
 */

import { GET as GET_LIST, POST } from '@/app/api/shopping-lists/route';
import { GET, PATCH, DELETE } from '@/app/api/shopping-lists/[id]/route';
import { prisma } from '@/lib/db';
import { NextRequest } from 'next/server';

// Mock Prisma
jest.mock('@/lib/db', () => ({
  prisma: {
    shoppingList: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    groceryItem: {
      findMany: jest.fn(),
    },
    category: {
      findMany: jest.fn(),
    },
  },
}));

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

describe('GET /api/shopping-lists', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return all shopping lists ordered by updatedAt', async () => {
    const mockLists = [
      {
        id: '1',
        name: 'Weekly Groceries',
        items: ['apple', 'banana'],
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-15'),
      },
      {
        id: '2',
        name: 'Party Supplies',
        items: ['chips', 'soda'],
        createdAt: new Date('2024-01-10'),
        updatedAt: new Date('2024-01-12'),
      },
    ];

    mockPrisma.shoppingList.findMany.mockResolvedValue(mockLists);

    const request = new NextRequest('http://localhost:3000/api/shopping-lists');
    const response = await GET_LIST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.data).toEqual(mockLists);
    expect(mockPrisma.shoppingList.findMany).toHaveBeenCalledWith({
      include: {
        items: {
          where: { isCompleted: false },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('should return empty array when no lists exist', async () => {
    mockPrisma.shoppingList.findMany.mockResolvedValue([]);

    const request = new NextRequest('http://localhost:3000/api/shopping-lists');
    const response = await GET_LIST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.data).toEqual([]);
  });

  it('should handle database errors gracefully', async () => {
    mockPrisma.shoppingList.findMany.mockRejectedValue(new Error('Database error'));

    const request = new NextRequest('http://localhost:3000/api/shopping-lists');
    const response = await GET_LIST(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toContain('Failed to fetch shopping lists');
  });
});

describe('POST /api/shopping-lists', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should create a new shopping list with valid data', async () => {
    const mockList = {
      id: '1',
      name: 'New List',
      items: ['milk', 'bread'],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    mockPrisma.shoppingList.create.mockResolvedValue(mockList);

    const request = new NextRequest('http://localhost:3000/api/shopping-lists', {
      method: 'POST',
      body: JSON.stringify({ name: 'New List', items: ['milk', 'bread'] }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.data).toEqual(mockList);
    expect(mockPrisma.shoppingList.create).toHaveBeenCalledWith({
      data: { name: 'New List' },
    });
  });

  it('should return validation error for missing name', async () => {
    const request = new NextRequest('http://localhost:3000/api/shopping-lists', {
      method: 'POST',
      body: JSON.stringify({}),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('Name is required');
  });

  it('should allow creating a list with empty items array', async () => {
    const mockList = {
      id: '1',
      name: 'Empty List',
      items: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    mockPrisma.shoppingList.create.mockResolvedValue(mockList);

    const request = new NextRequest('http://localhost:3000/api/shopping-lists', {
      method: 'POST',
      body: JSON.stringify({ name: 'Empty List', items: [] }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.data).toBeDefined();
  });
});

describe('GET /api/shopping-lists/[id]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return shopping list with valid id', async () => {
    const mockList = {
      id: '1',
      name: 'Test List',
      items: [
        { id: 'item1', name: 'apple', categoryId: 'cat1', isCompleted: false },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const mockCategories = [
      { id: 'cat1', name: 'Fruits', order: 1 },
    ];

    mockPrisma.shoppingList.findUnique.mockResolvedValue(mockList);
    mockPrisma.category.findMany.mockResolvedValue(mockCategories);

    const request = new NextRequest('http://localhost:3000/api/shopping-lists/1');
    const response = await GET(request, { params: { id: '1' } });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.id).toBe('1');
    expect(data.name).toBe('Test List');
  });

  it('should return 404 for non-existent list', async () => {
    mockPrisma.shoppingList.findUnique.mockResolvedValue(null);

    const request = new NextRequest('http://localhost:3000/api/shopping-lists/999');
    const response = await GET(request, { params: { id: '999' } });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toContain('Shopping list not found');
  });
});

describe('PATCH /api/shopping-lists/[id]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should update shopping list with valid data', async () => {
    const mockList = {
      id: '1',
      name: 'Updated List',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    mockPrisma.shoppingList.update.mockResolvedValue(mockList);

    const request = new NextRequest('http://localhost:3000/api/shopping-lists/1', {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Updated List' }),
    });

    const response = await PATCH(request, { params: { id: '1' } });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.name).toBe('Updated List');
  });

  it('should return 500 when updating non-existent list', async () => {
    mockPrisma.shoppingList.update.mockRejectedValue(new Error('Record not found'));

    const request = new NextRequest('http://localhost:3000/api/shopping-lists/999', {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Updated List' }),
    });

    const response = await PATCH(request, { params: { id: '999' } });
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toContain('Failed to update shopping list');
  });

  it('should allow partial updates', async () => {
    const updatedList = {
      id: '1',
      name: 'New Name',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    mockPrisma.shoppingList.update.mockResolvedValue(updatedList);

    const request = new NextRequest('http://localhost:3000/api/shopping-lists/1', {
      method: 'PATCH',
      body: JSON.stringify({ name: 'New Name' }),
    });

    const response = await PATCH(request, { params: { id: '1' } });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.name).toBe('New Name');
  });
});

describe('DELETE /api/shopping-lists/[id]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should delete shopping list with valid id', async () => {
    mockPrisma.shoppingList.delete.mockResolvedValue({} as any);

    const request = new NextRequest('http://localhost:3000/api/shopping-lists/1');
    const response = await DELETE(request, { params: { id: '1' } });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
  });

  it('should handle deleting non-existent list', async () => {
    mockPrisma.shoppingList.delete.mockRejectedValue(new Error('Record not found'));

    const request = new NextRequest('http://localhost:3000/api/shopping-lists/999');
    const response = await DELETE(request, { params: { id: '999' } });
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toContain('Failed to delete shopping list');
  });

  it('should handle database errors during deletion', async () => {
    mockPrisma.shoppingList.delete.mockRejectedValue(new Error('Database error'));

    const request = new NextRequest('http://localhost:3000/api/shopping-lists/1');
    const response = await DELETE(request, { params: { id: '1' } });
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toContain('Failed to delete shopping list');
  });
});
