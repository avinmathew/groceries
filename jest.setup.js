// Learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom'

// Polyfill for Next.js Request/Response in tests
import { TextEncoder, TextDecoder } from 'util';
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

// Mock NextResponse for tests
jest.mock('next/server', () => ({
  NextResponse: {
    json: (data, init) => {
      const headerStore = new Map(Object.entries(init?.headers || {}));
      return {
        status: init?.status || 200,
        headers: {
          set: (key, value) => headerStore.set(key, value),
          get: (key) => headerStore.get(key),
          has: (key) => headerStore.has(key),
        },
        json: async () => data,
      };
    },
  },
  NextRequest: class NextRequest {
    constructor(url, init) {
      this.url = url;
      this.method = init?.method || 'GET';
      this.body = init?.body;
    }
    async json() {
      return JSON.parse(this.body);
    }
  },
}));

// Mock Next.js cache utilities used in routes
jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
}));
