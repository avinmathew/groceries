"use client";

import { useState, useMemo, useEffect, useRef } from "react";
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
  refreshStatus?: string;
  categoryGroups: Array<{
    category: { id: string; name: string; order: number };
    items: Array<{
      id: string;
      groceryItemId: string;
      name: string;
      quantity: number;
      notes: string | null;
      status: string;
      categoryId: string | null;
      category: { id: string; name: string; order: number };
      shoppingListCount?: number;
      productLinks: Array<{
        id: string;
        store: string;
        label?: string | null;
        perUnit?: number | null;
        regularPrice: number | null;
        discountPrice: number | null;
        lastRefreshed: Date | null;
      }>;
    }>;
  }>;
  watchlistItems: Array<{
    id: string;
    groceryItemId: string;
    name: string;
    quantity: number;
    notes: string | null;
    status: string;
    categoryId: string | null;
    category: { id: string; name: string; order: number };
    shoppingListCount?: number;
    productLinks: Array<{
      id: string;
      store: string;
      label?: string | null;
      perUnit?: number | null;
      regularPrice: number | null;
      discountPrice: number | null;
      lastRefreshed: Date | null;
    }>;
  }>;
  completedItems: Array<{
    id: string;
    groceryItemId: string;
    name: string;
    quantity: number;
    notes: string | null;
    status: string;
    categoryId: string | null;
    category: { id: string; name: string; order: number };
    shoppingListCount?: number;
    productLinks: Array<{
      id: string;
      store: string;
      label?: string | null;
      perUnit?: number | null;
      regularPrice: number | null;
      discountPrice: number | null;
      lastRefreshed: Date | null;
    }>;
    completedAt: Date | null;
  }>;
};

const getPerUnitBase = (links: Array<{ perUnit?: number | null }>) => {
  const perUnits = links
    .map((link) => link.perUnit)
    .filter((value): value is number => typeof value === "number" && value > 0);

  if (!perUnits.length) return null;

  const minUnit = Math.min(...perUnits);
  return minUnit;
};

const normalizePrice = (price: number, perUnit: number | null | undefined, base: number | null) => {
  if (!base || !perUnit || perUnit <= 0) return price;
  return (price / perUnit) * base;
};

export function ShoppingListView({ shoppingList: initialShoppingList }: { shoppingList: ShoppingList }) {
  const [isEditMode, setIsEditMode] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [shoppingList, setShoppingList] = useState(initialShoppingList);
  const { toast } = useToast();
  const syncContext = useSync();
  const router = useRouter();
  const pollingRef = useRef(false);

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
        if (freshData && freshData.categoryGroups) {
          setShoppingList(freshData);
        }
      }
    } catch (error) {
      console.error("Failed to refresh shopping list after item added:", error);
      // Fallback: try the offline cache
      try {
        const cachedResponse = await offlineFetch(`${BASE_PATH}/api/shopping-lists/${shoppingList.id}`);
        if (cachedResponse?.data && cachedResponse.data.categoryGroups) {
          setShoppingList(cachedResponse.data);
        }
      } catch (cacheError) {
        console.error("Cache fallback also failed:", cacheError);
        // Keep the existing shoppingList state - don't corrupt it
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
    pollingRef.current = true;
    
    try {
      // Collect IDs of all active and watchlisted items (exclude completed items)
      const activeItemIds = shoppingList.categoryGroups
        .flatMap(group => group.items.map(item => item.groceryItemId));
      
      const watchlistItemIds = (shoppingList.watchlistItems || [])
        .map(item => item.groceryItemId);
      
      const allItemIds = [...activeItemIds, ...watchlistItemIds];

      // Start the refresh process in the background (returns immediately)
      const response = await fetch(`${BASE_PATH}/api/refresh-prices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          groceryItemIds: allItemIds,
          shoppingListId: shoppingList.id 
        }),
      });

      if (!response.ok) throw new Error("Failed to start price refresh");

      // Poll for updates every 3 seconds
      const pollInterval = 3000;
      
      const pollForUpdates = async () => {
        if (!pollingRef.current) return;
        
        // Fetch updated shopping list data
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
            if (freshData) {
              setShoppingList(freshData);
              
              // Stop polling if refresh is complete
              if (freshData.refreshStatus !== 'refreshing') {
                pollingRef.current = false;
                setIsRefreshing(false);
                toast({
                  title: "Success",
                  description: "Prices refreshed successfully",
                });
                return;
              }
            }
          }
        } catch (error) {
          console.error("Error polling for updates:", error);
        }

        // Continue polling if still active
        if (pollingRef.current) {
          setTimeout(pollForUpdates, pollInterval);
        }
      };

      // Start polling after initial delay
      setTimeout(pollForUpdates, pollInterval);
    } catch (error) {
      pollingRef.current = false;
      toast({
        title: "Error",
        description: "Failed to start price refresh",
        variant: "destructive",
      });
      setIsRefreshing(false);
    }
  };

  const handleToggleComplete = async (itemId: string, currentStatus: string) => {
    // Optimistic update - clicking always moves to completed, unless already completed
    const newStatus = currentStatus === 'completed' ? 'active' : 'completed';
    setShoppingList(prev => {
      let updatedGroups = prev.categoryGroups.map(group => ({
        ...group,
        items: group.items.filter(item => item.id !== itemId)
      }));
      let updatedWatchlistItems = prev.watchlistItems.filter(item => item.id !== itemId);

      if (newStatus === 'completed') {
        // Move to completed items from either active or watchlist
        const itemFromActive = prev.categoryGroups
          .flatMap(group => group.items)
          .find(item => item.id === itemId);
        
        const itemFromWatchlist = prev.watchlistItems.find(item => item.id === itemId);
        const itemToMove = itemFromActive || itemFromWatchlist;
        
        if (itemToMove) {
          updatedGroups = updatedGroups.filter(group => group.items.length > 0);
          return {
            ...prev,
            categoryGroups: updatedGroups,
            watchlistItems: updatedWatchlistItems,
            completedItems: [{
              ...itemToMove,
              status: 'completed',
              completedAt: new Date()
            }, ...prev.completedItems]
          };
        }
      } else {
        // Move back to active items from completed
        const itemToMove = prev.completedItems.find(item => item.id === itemId);
        
        if (itemToMove) {
          const activeItem = {
            ...itemToMove,
            status: 'active',
            completedAt: null
          };
          
          // Find existing group, handling null categoryId properly
          let targetGroupIndex = updatedGroups.findIndex(group => {
            if (itemToMove.categoryId === null) {
              return group.category.id === null || group.category.id === itemToMove.category?.id;
            }
            return group.category.id === itemToMove.categoryId;
          });
          
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
            watchlistItems: prev.watchlistItems,
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
        { status: newStatus },
        async () => {
          // Update in IndexedDB
          const item = await offlineDB.shoppingListItems.get(itemId);
          if (item) {
            await offlineDB.shoppingListItems.put({
              ...item,
              completed: newStatus === 'completed',
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

      const updatedWatchlistItems = prev.watchlistItems.filter(item => item.id !== itemId);
      const updatedCompletedItems = prev.completedItems.filter(item => item.id !== itemId);

      return {
        ...prev,
        categoryGroups: updatedGroups,
        watchlistItems: updatedWatchlistItems,
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
        const perUnitBase = getPerUnitBase(item.productLinks);
        const prices = item.productLinks
          .map((link) => {
            const price = link.discountPrice ?? link.regularPrice;
            if (price === null) return null;
            return normalizePrice(price, link.perUnit ?? null, perUnitBase);
          })
          .filter((p): p is number => p !== null);

        if (prices.length > 0) {
          const lowestPrice = Math.min(...prices);
          total += lowestPrice * item.quantity;
        }
      });
    });

    return total > 0 ? total : null;
  }, [shoppingList]);

  // Calculate total price for watchlist items
  const watchlistTotal = useMemo(() => {
    if (!shoppingList?.watchlistItems || shoppingList.watchlistItems.length === 0) return null;
    
    let total = 0;

    shoppingList.watchlistItems.forEach((item) => {
      const perUnitBase = getPerUnitBase(item.productLinks);
      const prices = item.productLinks
        .map((link) => {
          const price = link.discountPrice ?? link.regularPrice;
          if (price === null) return null;
          return normalizePrice(price, link.perUnit ?? null, perUnitBase);
        })
        .filter((p): p is number => p !== null);

      if (prices.length > 0) {
        const lowestPrice = Math.min(...prices);
        total += lowestPrice * item.quantity;
      }
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
              disabled={isRefreshing || !shoppingList || !shoppingList.categoryGroups || (!shoppingList.categoryGroups.some(g => g.items.length > 0) && (!shoppingList.watchlistItems || shoppingList.watchlistItems.length === 0))}
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
        {!shoppingList || !shoppingList.categoryGroups ? (
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
                      onToggleComplete={() => handleToggleComplete(item.id, item.status)}
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

            {/* Watch List Section */}
            {shoppingList.watchlistItems && shoppingList.watchlistItems.length > 0 && (
              <div className="pt-6">
                <div className="sticky top-[56px] z-5 bg-[#088395] px-2 py-1">
                  <h2 className="text-sm text-white font-semibold">Watch List</h2>
                </div>
                <div className="space-y-1">
                  {shoppingList.watchlistItems.map((item) => (
                    <GroceryItemRow
                      key={item.id}
                      item={item}
                      isEditMode={isEditMode}
                      onToggleComplete={() => handleToggleComplete(item.id, item.status)}
                      onItemDeleted={handleItemDeleted}
                    />
                  ))}
                </div>
                {watchlistTotal !== null && (
                  <div className="pt-2">
                    <div className="flex items-center justify-end gap-4 px-3 py-2 bg-blue-50 rounded-lg">
                      <span className="text-sm font-medium text-muted-foreground">Watch List Total:</span>
                      <span>${watchlistTotal.toFixed(2)}</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Crossed Off Section */}
            {shoppingList.completedItems && shoppingList.completedItems.length > 0 && (
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
                      onToggleComplete={() => handleToggleComplete(item.id, item.status)}
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
