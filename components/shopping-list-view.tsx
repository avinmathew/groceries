"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ArrowLeft, RefreshCw, Plus, Edit, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GroceryItemRow } from "@/components/grocery-item-row";
import { AddGroceryDialog } from "@/components/add-grocery-dialog";
import { useToast } from "@/hooks/use-toast";
import { useSync } from "@/lib/sync-provider";
import { offlineFetch, queueMutation } from "@/lib/api-utils";
import { offlineDB } from "@/lib/offline-db";
import { BASE_PATH } from "@/lib/utils";

type ShoppingList = {
  id: string;
  name: string;
  categoryGroups: Array<{
    category: { id: string; name: string; order: number };
    items: Array<{
      id: string;
      groceryItemId: string;
      name: string;
      quantity: number;
      notes: string | null;
      isCompleted: boolean;
      categoryId: string | null;
      category: { id: string; name: string; order: number };
      shoppingListCount?: number;
      productLinks: Array<{
        id: string;
        store: string;
        regularPrice: number | null;
        discountPrice: number | null;
        lastRefreshed: Date | null;
      }>;
    }>;
  }>;
  completedItems: Array<{
    id: string;
    groceryItemId: string;
    name: string;
    quantity: number;
    notes: string | null;
    isCompleted: boolean;
    categoryId: string | null;
    category: { id: string; name: string; order: number };
    shoppingListCount?: number;
    productLinks: Array<{
      id: string;
      store: string;
      regularPrice: number | null;
      discountPrice: number | null;
      lastRefreshed: Date | null;
    }>;
    completedAt: Date | null;
  }>;
};

export function ShoppingListView({ shoppingList: initialShoppingList }: { shoppingList: ShoppingList }) {
  const [isEditMode, setIsEditMode] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [shoppingList, setShoppingList] = useState(initialShoppingList);
  const { toast } = useToast();
  const syncContext = useSync();
  const router = useRouter();

  const unwrapApiResult = (result: any) => result?.data ?? result;
  
  // Only destructure what we need when we need it to avoid re-renders
  const isOnline = syncContext.isOnline;
  const sync = syncContext.sync;

  // Load from cache on mount
  useEffect(() => {
    const loadFromCache = async () => {
      try {
        const cached = await offlineFetch(`${BASE_PATH}/api/shopping-lists/${initialShoppingList.id}`);
        const data = unwrapApiResult(cached);
        if (data) setShoppingList(data);
      } catch (error) {
        console.log('Using server-rendered data');
      }
    };
    loadFromCache();
  }, [initialShoppingList.id]);

  const handleItemAdded = async () => {
    try {
      // Force a network fetch to get the latest shopping list with the new item
      const response = await fetch(`${BASE_PATH}/api/shopping-lists/${shoppingList.id}`, {
        method: 'GET',
        cache: 'no-store'
      });
      if (response.ok) {
        const result = await response.json();
        const freshData = result?.data || result;
        setShoppingList(freshData);
      }
    } catch (error) {
      console.error("Failed to refresh shopping list after item added:", error);
      // Fallback: try the offline cache
      try {
        const cachedResponse = await offlineFetch(`${BASE_PATH}/api/shopping-lists/${shoppingList.id}`);
        if (cachedResponse?.data) {
          setShoppingList(cachedResponse.data);
        }
      } catch (cacheError) {
        console.error("Cache fallback also failed:", cacheError);
      }
    }
  };

  const handleRefreshPrices = async () => {
    if (!isOnline) {
      toast({
        title: "Offline",
        description: "Price refresh requires an internet connection",
        variant: "destructive",
      });
      return;
    }

    setIsRefreshing(true);
    try {
      // Collect IDs of all active (non-completed) items
      const activeItemIds = shoppingList.categoryGroups
        .flatMap(group => group.items.map(item => item.groceryItemId));

      // Start the refresh process - this waits until scraping is complete
      const response = await fetch(`${BASE_PATH}/api/refresh-prices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groceryItemIds: activeItemIds }),
      });

      if (!response.ok) throw new Error("Failed to refresh prices");

      // Refresh is complete, now fetch the updated shopping list data (force fresh)
      try {
        const updatedResponse = await fetch(`${BASE_PATH}/api/shopping-lists/${shoppingList.id}`, {
          method: 'GET',
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache',
          },
        });

        if (updatedResponse.ok) {
          const result = await updatedResponse.json();
          const freshData = unwrapApiResult(result);
          if (freshData) setShoppingList(freshData);
        }
      } catch (error) {
        // Fallback: try the offline cache
        const cached = await offlineFetch(`${BASE_PATH}/api/shopping-lists/${shoppingList.id}`);
        const cachedData = unwrapApiResult(cached);
        if (cachedData) setShoppingList(cachedData);
      }

      setIsRefreshing(false);
      toast({
        title: "Success",
        description: "Prices refreshed successfully",
      });

    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to refresh prices",
        variant: "destructive",
      });
      setIsRefreshing(false);
    }
  };

  const handleToggleComplete = async (itemId: string, isCompleted: boolean) => {
    // Optimistic update
    const newIsCompleted = !isCompleted;
    setShoppingList(prev => {
      let updatedGroups = prev.categoryGroups.map(group => ({
        ...group,
        items: group.items.filter(item => item.id !== itemId)
      }));

      if (newIsCompleted) {
        // Move to completed items
        const itemToMove = prev.categoryGroups
          .flatMap(group => group.items)
          .find(item => item.id === itemId);
        
        if (itemToMove) {
          updatedGroups = updatedGroups.filter(group => group.items.length > 0);
          return {
            ...prev,
            categoryGroups: updatedGroups,
            completedItems: [{
              ...itemToMove,
              isCompleted: true,
              completedAt: new Date()
            }, ...prev.completedItems]
          };
        }
      } else {
        // Move back to active items
        const itemToMove = prev.completedItems.find(item => item.id === itemId);
        
        if (itemToMove) {
          const activeItem = {
            ...itemToMove,
            isCompleted: false,
            completedAt: null
          };
          
          let targetGroupIndex = updatedGroups.findIndex(group => group.category.id === itemToMove.categoryId);
          
          if (targetGroupIndex === -1) {
            const newGroup = itemToMove.category;
            updatedGroups = [
              ...updatedGroups,
              { category: newGroup, items: [activeItem] }
            ].sort((a, b) => a.category.order - b.category.order);
          } else {
            updatedGroups = [
              ...updatedGroups.slice(0, targetGroupIndex),
              {
                ...updatedGroups[targetGroupIndex],
                items: [...updatedGroups[targetGroupIndex].items, activeItem]
              },
              ...updatedGroups.slice(targetGroupIndex + 1)
            ];
          }
          
          return {
            ...prev,
            categoryGroups: updatedGroups,
            completedItems: prev.completedItems.filter(item => item.id !== itemId)
          };
        }
      }
      return prev;
    });

    // Queue mutation
    try {
      await queueMutation(
        'PATCH',
        `${BASE_PATH}/api/grocery-items/${itemId}`,
        { isCompleted: newIsCompleted },
        async () => {
          // Update in IndexedDB
          const item = await offlineDB.shoppingListItems.get(itemId);
          if (item) {
            await offlineDB.shoppingListItems.put({
              ...item,
              completed: newIsCompleted,
              updatedAt: new Date().toISOString(),
              _synced: false,
            });
          }
          return null;
        }
      );
      
      // Trigger sync if online
      if (isOnline) {
        await sync();
      }
    } catch (error) {
      toast({
        title: "Error",
        description: isOnline ? "Failed to update item" : "Update queued for sync",
        variant: isOnline ? "destructive" : "default",
      });
    }
  };

  const handleItemDeleted = (itemId: string) => {
    // Remove item from local state
    setShoppingList(prev => {
      const updatedGroups = prev.categoryGroups
        .map(group => ({
          ...group,
          items: group.items.filter(item => item.id !== itemId)
        }))
        .filter(group => group.items.length > 0);

      const updatedCompletedItems = prev.completedItems.filter(item => item.id !== itemId);

      return {
        ...prev,
        categoryGroups: updatedGroups,
        completedItems: updatedCompletedItems,
      };
    });
  };

  // Calculate total price for all active (non-completed) items using the lowest price per item
  const totalPrice = useMemo(() => {
    if (!shoppingList?.categoryGroups) return null;
    
    let total = 0;

    // Sum up the lowest prices for all active items (not completed)
    shoppingList.categoryGroups.forEach((group) => {
      group.items.forEach((item) => {
        const prices = item.productLinks
          .map((link) => link.discountPrice ?? link.regularPrice)
          .filter((p): p is number => p !== null);
        
        if (prices.length > 0) {
          const lowestPrice = Math.min(...prices);
          total += lowestPrice * item.quantity;
        }
      });
    });

    return total > 0 ? total : null;
  }, [shoppingList]);

  const handleBackClick = () => {
    router.push('/shopping-lists');
    router.refresh();
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b bg-background">
        <div className="container mx-auto flex h-14 items-center justify-between px-4">
          <Button variant="ghost" size="icon" onClick={handleBackClick}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-semibold">{shoppingList?.name || "Loading..."}</h1>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleRefreshPrices}
              disabled={isRefreshing || !shoppingList || !shoppingList.categoryGroups.some(g => g.items.length > 0)}
            >
              <RefreshCw className={`h-5 w-5 ${isRefreshing ? "animate-spin" : ""}`} />
            </Button>
            {shoppingList && <AddGroceryDialog shoppingListId={shoppingList.id} onItemAdded={handleItemAdded} />}
            <Button
              variant={isEditMode ? "default" : "ghost"}
              size="icon"
              onClick={() => setIsEditMode(!isEditMode)}
            >
              <Edit className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto">
        {!shoppingList ? (
          <div className="flex justify-center items-center h-64">
            <div>Loading...</div>
          </div>
        ) : (
          <div>
            {/* Category Groups */}
            {shoppingList.categoryGroups.map((group) => (
              <div key={group.category.id}>
                <div className="sticky top-[56px] z-5 bg-brand px-2 py-1">
                  <h2 className="text-sm text-white font-semibold">{group.category.name}</h2>
                </div>
                <div className="space-y-1">
                  {group.items.map((item) => (
                    <GroceryItemRow
                      key={item.id}
                      item={item}
                      isEditMode={isEditMode}
                      onToggleComplete={() => handleToggleComplete(item.id, item.isCompleted)}
                      onItemDeleted={handleItemDeleted}
                    />
                  ))}
                </div>
              </div>
            ))}

            {/* Total Price Section */}
            {totalPrice !== null && (
              <div className="pt-4">
                <div className="flex items-center justify-end gap-4 px-3 py-2 bg-muted/50 rounded-lg">
                  <span className="text-sm font-medium text-muted-foreground">Total:</span>
                  <span>${totalPrice.toFixed(2)}</span>
                </div>
              </div>
            )}

            {/* Add Item Section */}
            <div className="pt-4">
              <AddGroceryDialog shoppingListId={shoppingList.id} variant="link" onItemAdded={handleItemAdded} />
            </div>

            {/* Crossed Off Section */}
            {shoppingList.completedItems.length > 0 && (
              <div className="pt-6">
                <div className="sticky top-[56px] z-5 bg-brand-dark px-2 py-1">
                  <h2 className="text-sm text-white font-semibold">Crossed off</h2>
                </div>
                <div className="space-y-1">
                  {shoppingList.completedItems.map((item) => (
                    <GroceryItemRow
                      key={item.id}
                      item={item}
                      isEditMode={isEditMode}
                      onToggleComplete={() => handleToggleComplete(item.id, item.isCompleted)}
                      onItemDeleted={handleItemDeleted}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
