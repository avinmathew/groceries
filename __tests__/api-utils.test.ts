import { successResponse, errorResponse, validationError, notFoundError, serverError, getErrorMessage } from '../lib/api-utils';

// Mock Next.js NextResponse
jest.mock('next/server', () => ({
  NextResponse: {
    json: (data: any, init?: any) => ({
      data,
      status: init?.status || 200,
      json: async () => data,
    }),
  },
}));

describe('API Utils', () => {
  describe('successResponse', () => {
    it('should create a success response with data', () => {
      const data = { id: '123', name: 'Test' };
      const response = successResponse(data);
      
      expect(response.status).toBe(200);
    });

    it('should include optional message', () => {
      const data = { id: '123' };
      const response = successResponse(data, 'Operation successful');
      
      expect(response.status).toBe(200);
    });

    it('should support custom status codes', () => {
      const data = { id: '123' };
      const response = successResponse(data, 'Created', 201);
      
      expect(response.status).toBe(201);
    });
  });

  describe('errorResponse', () => {
    it('should create an error response with default status', () => {
      const response = errorResponse('Something went wrong');
      
      expect(response.status).toBe(500);
    });

    it('should support custom status codes', () => {
      const response = errorResponse('Not found', 404);
      
      expect(response.status).toBe(404);
    });

    it('should include optional details and code', () => {
      const response = errorResponse('Validation failed', 400, 'Name is required', 'VALIDATION_ERROR');
      
      expect(response.status).toBe(400);
    });
  });

  describe('validationError', () => {
    it('should create a 400 validation error', () => {
      const response = validationError('Invalid input');
      
      expect(response.status).toBe(400);
    });

    it('should include details', () => {
      const response = validationError('Invalid input', 'Name must be at least 3 characters');
      
      expect(response.status).toBe(400);
    });
  });

  describe('notFoundError', () => {
    it('should create a 404 not found error', () => {
      const response = notFoundError('User');
      
      expect(response.status).toBe(404);
    });
  });

  describe('serverError', () => {
    it('should create a 500 internal server error', () => {
      const response = serverError();
      
      expect(response.status).toBe(500);
    });

    it('should accept custom message and details', () => {
      const response = serverError('Database connection failed', 'Connection timeout');
      
      expect(response.status).toBe(500);
    });
  });

  describe('getErrorMessage', () => {
    it('should extract message from Error object', () => {
      const error = new Error('Something went wrong');
      const message = getErrorMessage(error);
      
      expect(message).toBe('Something went wrong');
    });

    it('should handle string errors', () => {
      const message = getErrorMessage('Error string');
      
      expect(message).toBe('Error string');
    });

    it('should handle unknown error types', () => {
      const message = getErrorMessage({ unknown: 'object' });
      
      expect(message).toBe('An unknown error occurred');
    });

    it('should handle null/undefined', () => {
      const nullMessage = getErrorMessage(null);
      const undefinedMessage = getErrorMessage(undefined);
      
      expect(nullMessage).toBe('An unknown error occurred');
      expect(undefinedMessage).toBe('An unknown error occurred');
    });
  });
});
