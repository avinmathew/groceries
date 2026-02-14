import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { successResponse, validationError, serverError, getErrorMessage } from "@/lib/server/api-responses";
import { validateRequest } from "@/lib/server/validate-request";
import { createProductLinkSchema } from "@/lib/schemas/api-schemas";
import { getIdempotencyKey, checkIdempotencyKey, storeIdempotencyKey } from "@/lib/server/idempotency";

export async function POST(request: Request) {
  try {
    // Check for idempotency key
    const idempotencyKey = getIdempotencyKey(request);
    if (idempotencyKey) {
      const cached = checkIdempotencyKey(idempotencyKey);
      if (cached) {
        return successResponse(cached.data, "Product link created successfully (cached)", 201);
      }
    }

    const result = await validateRequest(request, createProductLinkSchema);
    if ('error' in result) return result.error;
    
    const { url, store, groceryItemId, label, perUnit } = result.data;

    const productLink = await prisma.productLink.create({
      data: {
        url,
        store,
        groceryItemId,
        label: label || null,
        perUnit: perUnit || null,
      },
    });

    // Store idempotency key
    if (idempotencyKey) {
      storeIdempotencyKey(idempotencyKey, productLink);
    }

    return successResponse(productLink, "Product link created successfully", 201);
  } catch (error) {
    return serverError("Failed to create product link", getErrorMessage(error));
  }
}
