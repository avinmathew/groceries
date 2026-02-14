import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { successResponse, serverError, getErrorMessage } from "@/lib/server/api-responses";
import { validateRequest } from "@/lib/server/validate-request";
import { updateProductLinkSchema } from "@/lib/schemas/api-schemas";

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const result = await validateRequest(request, updateProductLinkSchema);
    if ('error' in result) return result.error;
    
    const { url, label, perUnit, regularPrice, discountPrice, lastRefreshed } = result.data;

    const updateData: any = {};
    if (url !== undefined) updateData.url = url;
    if (label !== undefined) updateData.label = label || null;
    if (perUnit !== undefined) updateData.perUnit = perUnit;
    if (regularPrice !== undefined) updateData.regularPrice = regularPrice;
    if (discountPrice !== undefined) updateData.discountPrice = discountPrice;
    if (lastRefreshed !== undefined) updateData.lastRefreshed = lastRefreshed;

    const updatedLink = await prisma.productLink.update({
      where: { id: params.id },
      data: updateData,
    });

    return successResponse(updatedLink, "Product link updated successfully");
  } catch (error) {
    return serverError("Failed to update product link", getErrorMessage(error));
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    await prisma.productLink.delete({
      where: { id: params.id },
    });

    return successResponse({ success: true }, "Product link deleted successfully");
  } catch (error) {
    return serverError("Failed to delete product link", getErrorMessage(error));
  }
}
