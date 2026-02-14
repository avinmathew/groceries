import { z } from "zod";
import { validationError } from "../server/api-responses";
import { NextResponse } from "next/server";

/**
 * Parse and validate request body against a Zod schema
 * Returns the validated data or a validation error response
 */
export async function validateRequest<T extends z.ZodType>(
  request: Request,
  schema: T
): Promise<{ data: z.infer<T> } | { error: NextResponse }> {
  try {
    const body = await request.json();
    const validated = schema.parse(body);
    return { data: validated };
  } catch (error) {
    if (error instanceof z.ZodError) {
      // For single errors, use the message directly; for multiple, provide details
      if (error.errors.length === 1) {
        const err = error.errors[0];
        return { error: validationError(err.message) };
      } else {
        const messages = error.errors.map(err => `${err.path.join('.')}: ${err.message}`).join(', ');
        return { error: validationError("Validation failed", messages) };
      }
    }
    return { error: validationError("Invalid request body") };
  }
}

/**
 * Validate URL parameters against a Zod schema
 */
export function validateParams<T extends z.ZodType>(
  params: any,
  schema: T
): { data: z.infer<T> } | { error: NextResponse } {
  try {
    const validated = schema.parse(params);
    return { data: validated };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const messages = error.errors.map(err => `${err.path.join('.')}: ${err.message}`).join(', ');
      return { error: validationError("Invalid parameters", messages) };
    }
    return { error: validationError("Invalid parameters") };
  }
}
