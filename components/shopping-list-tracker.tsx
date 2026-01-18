"use client";

import { useEffect } from "react";

interface ShoppingListTrackerProps {
  listId: string;
}

export function ShoppingListTracker({ listId }: ShoppingListTrackerProps) {
  useEffect(() => {
    // Save the current shopping list ID to localStorage
    localStorage.setItem("lastShoppingListId", listId);
  }, [listId]);

  // This component doesn't render anything
  return null;
}
