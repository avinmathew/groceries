import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { successResponse, validationError, serverError, getErrorMessage } from "@/lib/server/api-responses";
import { validateRequest } from "@/lib/server/validate-request";
import { createCategorySchema } from "@/lib/schemas/api-schemas";
import { getIdempotencyKey, checkIdempotencyKey, storeIdempotencyKey } from "@/lib/server/idempotency";

export async function GET() {
  try {
    const categories = await prisma.category.findMany({
      orderBy: {
        order: "asc",
      },
    });

    const response = successResponse(categories);
    // Prevent caching in development - always fetch fresh data
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    response.headers.set('Pragma', 'no-cache');
    response.headers.set('Expires', '0');
    return response;
  } catch (error) {
    return serverError("Failed to fetch categories", getErrorMessage(error));
  }
}

export async function POST(request: Request) {
  try {
    // Check for idempotency key
    const idempotencyKey = getIdempotencyKey(request);
    if (idempotencyKey) {
      const cached = checkIdempotencyKey(idempotencyKey);
      if (cached) {
        return successResponse(cached.data, "Category created successfully (cached)", 201);
      }
    }

    const result = await validateRequest(request, createCategorySchema);
    if ('error' in result) return result.error;
    
    const { name } = result.data;

    // Get the highest order value
    const maxOrder = await prisma.category.findFirst({
      orderBy: { order: "desc" },
      select: { order: true },
    });

    const category = await prisma.category.create({
      data: {
        name,
        order: (maxOrder?.order ?? -1) + 1,
      },
    });

    // Store idempotency key
    if (idempotencyKey) {
      storeIdempotencyKey(idempotencyKey, category);
    }

    return successResponse(category, "Category created successfully", 201);
  } catch (error) {
    return serverError("Failed to create category", getErrorMessage(error));
  }
}
