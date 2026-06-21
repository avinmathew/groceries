"use client";

import { useState, useEffect, useRef } from "react";
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
import { offlineFetch, queueMutation } from "@/lib/client/offline-fetch";
import { offlineDB } from "@/lib/offline-db";
import { BASE_PATH } from "@/lib/utils";

type Grocery = {
  id?: string;
  name: string;
  categoryId: string | null;
  shoppingLists: { id: string; name: string }[];
};

/**
 * Returns true when every whitespace-separated token in `query` is found as a
 * substring within at least one whitespace-separated token in `name`.
 * Matching is case-insensitive and token order is irrelevant.
 * Examples:
 *   matchesTokens("brown onions", "onion brown") → true
 *   matchesTokens("brown onions", "bro oni")     → true
 *   matchesTokens("brown onions", "garlic")      → false
 */
function matchesTokens(name: string, query: string): boolean {
  const nameTokens = name.toLowerCase().split(/\s+/).filter(Boolean);
  const queryTokens = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return queryTokens.every((qt) => nameTokens.some((nt) => nt.includes(qt)));
}

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
  const [activeIndex, setActiveIndex] = useState(-1);
  const [isLoading, setIsLoading] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const resultRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const router = useRouter();
  const { toast } = useToast();
  const { isOnline, sync, updatePendingCount } = useSync();

  useEffect(() => {
    if (!open) {
      setQuantity(1);
      return;
    }

    let isCancelled = false;

    // Refresh existing groceries each time the dialog opens so the search list
    // doesn't get stuck with stale or empty data from an earlier fetch.
    offlineFetch(`${BASE_PATH}/api/groceries`)
      .then((response) => {
        if (isCancelled) {
          return;
        }

        const data = response?.data || response;
        if (Array.isArray(data)) {
          const normalized = data.map((item) => ({
            name: item.name,
            categoryId: item.categoryId ?? null,
            shoppingLists: Array.isArray(item.shoppingLists) ? item.shoppingLists : [],
          }));

          setGroceries(normalized);
        }
      })
      .catch(() => {
        // If endpoint doesn't exist, that's okay - we'll just use the current input.
      });

    return () => {
      isCancelled = true;
    };
  }, [open]);

  useEffect(() => {
    const query = searchQuery.trim().toLowerCase();

    if (!query) {
      setFilteredGroceries(groceries);
      return;
    }

    const filtered = groceries.filter((g) => matchesTokens(g.name, query));
    setFilteredGroceries(filtered);
  }, [searchQuery, groceries]);

  useEffect(() => {
    setActiveIndex((prev) => {
      if (filteredGroceries.length === 0) {
        return -1;
      }
      return prev >= filteredGroceries.length ? filteredGroceries.length - 1 : prev;
    });
  }, [filteredGroceries]);

  useEffect(() => {
    if (activeIndex >= 0) {
      resultRefs.current[activeIndex]?.scrollIntoView({ block: "nearest" });
    }
  }, [activeIndex]);

  const handleSelectGrocery = async (groceryName: string) => {
    setIsLoading(true);
    try {
      await queueMutation(
        'POST',
        `${BASE_PATH}/api/grocery-items`,
        {
          name: groceryName,
          shoppingListId,
          quantity,
        },
        async () => {
          // Optimistic: add temporary item to cache
          const tempId = `temp_${Date.now()}`;
          await offlineDB.shoppingListItems.add({
            id: tempId,
            shoppingListId,
            groceryItemId: tempId,
            quantity,
            notes: null,
            status: 'active',
            completedAt: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            _synced: false,
          });
          return null;
        }
      );

      setOpen(false);
      setSearchQuery("");
      setActiveIndex(-1);
      setQuantity(1);
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
        <div className="flex items-center gap-3 mb-3">
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              aria-label="Decrease quantity"
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              disabled={quantity <= 1}
              className="h-8 w-8 rounded border flex items-center justify-center text-lg leading-none disabled:opacity-40"
            >
              −
            </button>
            <span className="w-6 text-center tabular-nums">{quantity}</span>
            <button
              type="button"
              aria-label="Increase quantity"
              onClick={() => setQuantity((q) => q + 1)}
              className="h-8 w-8 rounded border flex items-center justify-center text-lg leading-none"
            >
              +
            </button>
          </div>
          <Input
            placeholder="Type to search..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setActiveIndex(-1);
            }}
            autoFocus
            autoCapitalize="none"
            className="flex-1"
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              if (filteredGroceries.length > 0) {
                e.preventDefault();
                setActiveIndex((prev) => (prev < 0 ? 0 : (prev + 1) % filteredGroceries.length));
              }
              return;
            }

            if (e.key === "ArrowUp") {
              if (filteredGroceries.length > 0) {
                e.preventDefault();
                setActiveIndex((prev) =>
                  prev < 0 ? filteredGroceries.length - 1 : (prev - 1 + filteredGroceries.length) % filteredGroceries.length
                );
              }
              return;
            }

            if (e.key === "Enter" && searchQuery.trim()) {
              if (activeIndex >= 0 && filteredGroceries[activeIndex]) {
                e.preventDefault();
                handleSelectGrocery(filteredGroceries[activeIndex].name);
                return;
              }

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
        </div>
        <div className="mt-2 max-h-[60vh] overflow-y-auto space-y-1">
          {filteredGroceries.length > 0 ? (
            <>
              {filteredGroceries.map((grocery, index) => (
                <button
                  key={`${grocery.name}-${index}`}
                  ref={(el) => {
                    resultRefs.current[index] = el;
                  }}
                  onClick={() => handleSelectGrocery(grocery.name)}
                  className={`w-full text-left px-3 py-2 rounded hover:bg-accent ${activeIndex === index ? "bg-accent" : ""}`}
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
