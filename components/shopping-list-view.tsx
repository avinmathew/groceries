"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, RefreshCw, Plus, Edit, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GroceryItemRow } from "@/components/grocery-item-row";
import { AddGroceryDialog } from "@/components/add-grocery-dialog";
import { useToast } from "@/hooks/use-toast";
import { BASE_PATH } from "@/lib/utils";

type ShoppingList = {
  id: string;
  name: string;
  categoryGroups: Array<{
    category: { id: string; name: string; order: number };
    items: Array<{
      id: string;
      name: string;
      quantity: number;
      notes: string | null;
      isCompleted: boolean;
      categoryId: string | null;
      category: { id: string; name: string; order: number };
      productLinks: Array<{
        id: string;
        store: string;
        regularPrice: number | null;
        discountPrice: number | null;
      }>;
    }>;
  }>;
  completedItems: Array<{
    id: string;
    name: string;
    quantity: number;
    notes: string | null;
    isCompleted: boolean;
    categoryId: string | null;
    category: { id: string; name: string; order: number };
    productLinks: Array<{
      id: string;
      store: string;
      regularPrice: number | null;
      discountPrice: number | null;
    }>;
    completedAt: Date | null;
  }>;
};

export function ShoppingListView({ shoppingList: initialShoppingList }: { shoppingList: ShoppingList }) {
  const [isEditMode, setIsEditMode] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [shoppingList, setShoppingList] = useState(initialShoppingList);
  const { toast } = useToast();

  const handleRefreshPrices = async () => {
    setIsRefreshing(true);
    try {
      // Start the refresh process
      const response = await fetch(`${BASE_PATH}/api/refresh-prices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      if (!response.ok) throw new Error("Failed to refresh prices");

      // Poll for updates every 2 seconds during refresh
      const pollInterval = setInterval(async () => {
        try {
          const updatedResponse = await fetch(`${BASE_PATH}/api/shopping-lists/${shoppingList.id}`);
          if (updatedResponse.ok) {
            const updatedShoppingList = await updatedResponse.json();
            setShoppingList(updatedShoppingList);
          }
        } catch (error) {
          console.error("Error polling for updates:", error);
        }
      }, 2000);

      // Stop polling after 60 seconds (assuming refresh won't take longer)
      setTimeout(() => {
        clearInterval(pollInterval);
        setIsRefreshing(false);
        toast({
          title: "Success",
          description: "Prices refreshed successfully",
        });
      }, 60000);

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
    try {
      const response = await fetch(`${BASE_PATH}/api/grocery-items/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isCompleted: !isCompleted }),
      });

      if (!response.ok) throw new Error("Failed to update item");

      // Update local state instead of reloading
      setShoppingList(prev => {
        const newIsCompleted = !isCompleted;
        
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
            // Filter out empty groups
            updatedGroups = updatedGroups.filter(group => group.items.length > 0);
            
            return {
              ...prev,
              categoryGroups: updatedGroups,
              // Completed item is added to the start of the list
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
            
            // Find or create the target category group
            let targetGroupIndex = updatedGroups.findIndex(group => group.category.id === itemToMove.categoryId);
            
            if (targetGroupIndex === -1) {
              // Category group was removed or doesn't exist. Recreate it.
              const newGroup = itemToMove.category;
              updatedGroups = [
                ...updatedGroups,
                { category: newGroup, items: [activeItem] }
              ].sort((a, b) => a.category.order - b.category.order);
            } else {
              // Category group exists, add item to it
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

    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update item",
        variant: "destructive",
      });
    }
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

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b bg-background">
        <div className="container mx-auto flex h-14 items-center justify-between px-4">
          <Link href="/shopping-lists">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <h1 className="text-xl font-semibold">{shoppingList?.name || "Loading..."}</h1>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleRefreshPrices}
              disabled={isRefreshing || !shoppingList}
            >
              <RefreshCw className={`h-5 w-5 ${isRefreshing ? "animate-spin" : ""}`} />
            </Button>
            {shoppingList && <AddGroceryDialog shoppingListId={shoppingList.id} />}
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
                <div className="sticky top-[56px] z-5 bg-[#99C556] px-2 py-1">
                  <h2 className="text-sm text-white font-semibold">{group.category.name}</h2>
                </div>
                <div className="space-y-1">
                  {group.items.map((item) => (
                    <GroceryItemRow
                      key={item.id}
                      item={item}
                      isEditMode={isEditMode}
                      onToggleComplete={() => handleToggleComplete(item.id, item.isCompleted)}
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
              <AddGroceryDialog shoppingListId={shoppingList.id} variant="link" />
            </div>

            {/* Crossed Off Section */}
            {shoppingList.completedItems.length > 0 && (
              <div className="pt-6">
                <div className="sticky top-[56px] z-5 bg-[#599245] px-2 py-1">
                  <h2 className="text-sm text-white font-semibold">Crossed off</h2>
                </div>
                <div className="space-y-1">
                  {shoppingList.completedItems.map((item) => (
                    <GroceryItemRow
                      key={item.id}
                      item={item}
                      isEditMode={isEditMode}
                      onToggleComplete={() => handleToggleComplete(item.id, item.isCompleted)}
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
