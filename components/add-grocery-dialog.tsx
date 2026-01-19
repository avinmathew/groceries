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
import { BASE_PATH } from "@/lib/utils";

type Grocery = {
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

  useEffect(() => {
    // Fetch all existing groceries for autocomplete
    fetch(`${BASE_PATH}/api/groceries`)
      .then((res) => res.json())
      .then((data) => {
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
      const response = await fetch(`${BASE_PATH}/api/grocery-items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: groceryName,
          shoppingListId,
        }),
      });

      if (!response.ok) throw new Error("Failed to add grocery item");

      setOpen(false);
      setSearchQuery("");
      router.refresh();
      onItemAdded?.();
      toast({
        title: "Success",
        description: "Item added to shopping list",
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
          onKeyDown={(e) => {
            if (e.key === "Enter" && filteredGroceries.length === 0 && searchQuery.trim()) {
              handleCreateNew();
            }
          }}
        />
        <div className="mt-2 max-h-[60vh] overflow-y-auto space-y-1">
          {filteredGroceries.length > 0 ? (
            filteredGroceries.map((grocery, index) => (
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
            ))
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
        <DialogContent className="sm:max-w-lg w-[calc(100vw-1rem)] max-h-[calc(100vh-2rem)] sm:max-h-[80vh] sm:rounded-lg rounded-none">
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
      <DialogContent className="sm:max-w-lg w-[calc(100vw-1rem)] max-h-[calc(100vh-2rem)] sm:max-h-[80vh] sm:rounded-lg rounded-none">
        {dialogContent}
      </DialogContent>
    </Dialog>
  );
}
