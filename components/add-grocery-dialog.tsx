"use client";

import { useState, useEffect } from "react";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useSync } from "@/lib/sync-provider";
import { offlineFetch, queueMutation } from "@/lib/api-utils";
import { offlineDB } from "@/lib/offline-db";
import { BASE_PATH } from "@/lib/utils";

type Grocery = {
  id?: string;
  name: string;
  categoryId: string | null;
  shoppingLists: { id: string; name: string }[];
};

type AddGroceryDialogProps = {
  shoppingListId: string;
  variant?: "default" | "link";
  onItemAdded?: () => void;
};

export function AddGroceryDialog({ shoppingListId, variant = "default", onItemAdded }: AddGroceryDialogProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [groceries, setGroceries] = useState<Grocery[]>([]);
  const [filteredGroceries, setFilteredGroceries] = useState<Grocery[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const { toast } = useToast();
  const { isOnline, sync, updatePendingCount } = useSync();

  useEffect(() => {
    // Fetch all existing groceries for autocomplete
    offlineFetch(`${BASE_PATH}/api/groceries`)
      .then((response) => {
        const data = response?.data || response;
        if (Array.isArray(data)) {
          const normalized = data.map((item) => ({
            name: item.name,
            categoryId: item.categoryId ?? null,
            shoppingLists: Array.isArray(item.shoppingLists) ? item.shoppingLists : [],
          }));

          setGroceries(normalized);
          setFilteredGroceries(normalized);
        }
      })
      .catch(() => {
        // If endpoint doesn't exist, that's okay - we'll just use the search
      });
  }, []);

  useEffect(() => {
    const query = searchQuery.trim().toLowerCase();

    if (!query) {
      setFilteredGroceries(groceries);
      return;
    }

    const filtered = groceries.filter((g) =>
      g.name.toLowerCase().includes(query)
    );
    setFilteredGroceries(filtered);
  }, [searchQuery, groceries]);

  const handleSelectGrocery = async (groceryName: string) => {
    setIsLoading(true);
    try {
      await queueMutation(
        'POST',
        `${BASE_PATH}/api/grocery-items`,
        {
          name: groceryName,
          shoppingListId,
        },
        async () => {
          // Optimistic: add temporary item to cache
          const tempId = `temp_${Date.now()}`;
          await offlineDB.shoppingListItems.add({
            id: tempId,
            shoppingListId,
            groceryItemId: tempId,
            quantity: 1,
            notes: null,
            completed: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            _synced: false,
          });
          return null;
        }
      );

      setOpen(false);
      setSearchQuery("");
      onItemAdded?.();
      
      if (isOnline) {
        await sync();
      } else {
        // Update pending count to show badge when offline
        await updatePendingCount();
      }
      
      toast({
        title: "Success",
        description: isOnline ? "Item added to shopping list" : "Item queued (offline)",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to add item",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateNew = async () => {
    if (!searchQuery.trim()) return;
    await handleSelectGrocery(searchQuery.trim());
  };

  const dialogContent = (
    <>
      <DialogHeader>
        <DialogTitle>Add an item</DialogTitle>
        <DialogDescription>Type to search for existing items or create a new one.</DialogDescription>
      </DialogHeader>
      <div className="py-4">
        <Input
          placeholder="Type to search..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          autoFocus
          autoCapitalize="none"
          onKeyDown={(e) => {
            if (e.key === "Enter" && searchQuery.trim()) {
              const exactMatch = filteredGroceries.find(
                (g) => g.name.toLowerCase() === searchQuery.trim().toLowerCase()
              );
              if (exactMatch) {
                handleSelectGrocery(exactMatch.name);
              } else {
                handleCreateNew();
              }
            }
          }}
        />
        <div className="mt-2 max-h-[60vh] overflow-y-auto space-y-1">
          {filteredGroceries.length > 0 ? (
            <>
              {filteredGroceries.map((grocery, index) => (
                <button
                  key={`${grocery.name}-${index}`}
                  onClick={() => handleSelectGrocery(grocery.name)}
                  className="w-full text-left px-3 py-2 rounded hover:bg-accent"
                >
                  <span className="font-medium">{grocery.name}</span>
                  {grocery.shoppingLists.length > 0 && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      On {grocery.shoppingLists.map((list) => list.name).join(", ")}
                    </p>
                  )}
                </button>
              ))}
              {searchQuery.trim() && !filteredGroceries.some(
                (g) => g.name.toLowerCase() === searchQuery.trim().toLowerCase()
              ) && (
                <button
                  onClick={handleCreateNew}
                  disabled={isLoading}
                  className="w-full text-left px-3 py-2 rounded hover:bg-accent mt-2"
                >
                  Create &quot;{searchQuery}&quot;
                </button>
              )}
            </>
          ) : searchQuery.trim() ? (
            <button
              onClick={handleCreateNew}
              disabled={isLoading}
              className="w-full text-left px-3 py-2 rounded hover:bg-accent mt-2"
            >
              Create &quot;{searchQuery}&quot;
            </button>
          ) : (
            <p className="text-sm text-muted-foreground px-3 py-2">No items yet. Start typing to add one.</p>
          )}
        </div>
      </div>
    </>
  );

  if (variant === "link") {
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <button className="text-muted-foreground hover:text-foreground text-left w-full p-2">
            Add an item...
          </button>
        </DialogTrigger>
        <DialogContent className="inset-x-0 top-2 translate-x-0 translate-y-0 mx-auto w-[calc(100vw-1rem)] max-h-[calc(100dvh-2rem)] rounded-none sm:top-[50%] sm:left-[50%] sm:translate-x-[-50%] sm:translate-y-[-50%] sm:max-w-lg sm:max-h-[80vh] sm:rounded-lg">
          {dialogContent}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="icon" className="bg-brand hover:bg-brand-dark text-white">
          <Plus className="h-5 w-5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="inset-x-0 top-2 translate-x-0 translate-y-0 mx-auto w-[calc(100vw-1rem)] max-h-[calc(100dvh-2rem)] rounded-none sm:top-[50%] sm:left-[50%] sm:translate-x-[-50%] sm:translate-y-[-50%] sm:max-w-lg sm:max-h-[80vh] sm:rounded-lg">
        {dialogContent}
      </DialogContent>
    </Dialog>
  );
}
