"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";

export async function updateShoppingList(id: string, name: string) {
  try {
    const shoppingList = await prisma.shoppingList.update({
      where: { id },
      data: { name },
    });

    // Revalidate the shopping lists pages
    revalidatePath("/shopping-lists");
    revalidatePath(`/shopping-lists/${id}`);

    return { success: true, shoppingList };
  } catch (error) {
    console.error("Error updating shopping list:", error);
    return { success: false, error: "Failed to update shopping list" };
  }
}
