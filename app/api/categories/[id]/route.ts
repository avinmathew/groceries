import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { successResponse, serverError, getErrorMessage } from "@/lib/server/api-responses";
import { validateRequest } from "@/lib/server/validate-request";
import { updateCategorySchema } from "@/lib/schemas/api-schemas";

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const result = await validateRequest(request, updateCategorySchema);
    if ('error' in result) return result.error;
    
    const { name, order } = result.data;

    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (order !== undefined) updateData.order = order;

    const category = await prisma.category.update({
      where: { id: params.id },
      data: updateData,
    });

    return successResponse(category, "Category updated successfully");
  } catch (error) {
    return serverError("Failed to update category", getErrorMessage(error));
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    await prisma.category.delete({
      where: { id: params.id },
    });

    return successResponse({ success: true }, "Category deleted successfully");
  } catch (error) {
    return serverError("Failed to delete category", getErrorMessage(error));
  }
}
