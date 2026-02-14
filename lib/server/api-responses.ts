import { NextResponse } from "next/server";

export type ApiError = {
  error: string;
  details?: string;
  code?: string;
};

export type ApiSuccess<T = unknown> = {
  data: T;
  message?: string;
};

/**
 * Standard success response helper
 */
export function successResponse<T>(data: T, message?: string, status = 200): NextResponse {
  const response: ApiSuccess<T> = { data };
  if (message) response.message = message;
  return NextResponse.json(response, { status });
}

/**
 * Standard error response helper
 */
export function errorResponse(
  error: string,
  status = 500,
  details?: string,
  code?: string
): NextResponse {
  const response: ApiError = { error };
  if (details) response.details = details;
  if (code) response.code = code;
  
  console.error(`API Error (${status}):`, { error, details, code });
  
  return NextResponse.json(response, { status });
}

/**
 * Validation error response (400)
 */
export function validationError(message: string, details?: string): NextResponse {
  return errorResponse(message, 400, details, "VALIDATION_ERROR");
}

/**
 * Not found error response (404)
 */
export function notFoundError(resource: string): NextResponse {
  return errorResponse(`${resource} not found`, 404, undefined, "NOT_FOUND");
}

/**
 * Internal server error response (500)
 */
export function serverError(message = "Internal server error", details?: string): NextResponse {
  return errorResponse(message, 500, details, "INTERNAL_ERROR");
}

/**
 * Extract error message from unknown error type
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "An unknown error occurred";
}
