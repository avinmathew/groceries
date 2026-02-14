import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { successResponse, validationError, serverError, getErrorMessage } from "@/lib/server/api-responses";
import { validateRequest } from "@/lib/server/validate-request";
import { createShoppingListSchema } from "@/lib/schemas/api-schemas";
import { getIdempotencyKey, checkIdempotencyKey, storeIdempotencyKey } from "@/lib/server/idempotency";

export async function GET() {
  try {
    const shoppingLists = await prisma.shoppingList.findMany({
      include: {
        items: {
          where: {
            status: {
              not: 'completed',
            },
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    const response = successResponse(shoppingLists);
    // Prevent caching in development - always fetch fresh data
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    response.headers.set('Pragma', 'no-cache');
    response.headers.set('Expires', '0');
    return response;
  } catch (error) {
    return serverError("Failed to fetch shopping lists", getErrorMessage(error));
  }
}

export async function POST(request: Request) {
  try {
    // Check for idempotency key
    const idempotencyKey = getIdempotencyKey(request);
    if (idempotencyKey) {
      const cached = checkIdempotencyKey(idempotencyKey);
      if (cached) {
        return successResponse(cached.data, "Shopping list created successfully (cached)", 201);
      }
    }
    
    const result = await validateRequest(request, createShoppingListSchema);
    if ('error' in result) return result.error;
    
    const { name } = result.data;

    const shoppingList = await prisma.shoppingList.create({
      data: { name },
    });

    // Store idempotency key
    if (idempotencyKey) {
      storeIdempotencyKey(idempotencyKey, shoppingList);
    }

    revalidatePath("/shopping-lists");

    return successResponse(shoppingList, "Shopping list created successfully", 201);
  } catch (error) {
    return serverError("Failed to create shopping list", getErrorMessage(error));
  }
}
