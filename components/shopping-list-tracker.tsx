"use client";

import { useEffect } from "react";

interface ShoppingListTrackerProps {
  listId: string;
}

export function ShoppingListTracker({ listId }: ShoppingListTrackerProps) {
  useEffect(() => {
    // Save the current shopping list ID to localStorage
    localStorage.setItem("lastShoppingListId", listId);
    
    // Also set a cookie for server-side access (to avoid PWA redirection issues)
    document.cookie = `lastShoppingListId=${listId}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  }, [listId]);

  // This component doesn't render anything
  return null;
}
