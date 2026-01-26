import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { successResponse, validationError, serverError, getErrorMessage } from "@/lib/api-utils";

export async function GET() {
  try {
    const shoppingLists = await prisma.shoppingList.findMany({
      include: {
        items: {
          where: {
            isCompleted: false,
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
    const { name } = await request.json();

    if (!name || typeof name !== "string") {
      return validationError("Name is required");
    }

    const shoppingList = await prisma.shoppingList.create({
      data: {
        name,
      },
    });

    revalidatePath("/shopping-lists");

    return successResponse(shoppingList, "Shopping list created successfully", 201);
  } catch (error) {
    return serverError("Failed to create shopping list", getErrorMessage(error));
  }
}
