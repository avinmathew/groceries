"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Info, Trash2, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useRouter } from "next/navigation";
import { BASE_PATH, isPriceStale } from "@/lib/utils";

type GroceryItem = {
  id: string;
  groceryItemId: string;
  name: string;
  quantity: number;
  notes: string | null;
  isCompleted: boolean;
  shoppingListCount?: number;
  productLinks: Array<{
    id: string;
    store: string;
    regularPrice: number | null;
    discountPrice: number | null;
    lastRefreshed: Date | null;
  }>;
};

export function GroceryItemRow({
  item,
  isEditMode,
  onToggleComplete,
  onItemDeleted,
}: {
  item: GroceryItem;
  isEditMode: boolean;
  onToggleComplete: () => void;
  onItemDeleted?: (itemId: string) => void;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const shoppingListCount = item.shoppingListCount ?? null;

  const handleDeleteClick = () => {
    setShowDeleteDialog(true);
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const response = await fetch(`${BASE_PATH}/api/grocery-items/${item.groceryItemId}?scope=all`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Failed to delete item");

      toast({
        title: "Success",
        description: "Item deleted successfully",
      });
      
      // Call the callback to remove item from UI immediately
      if (onItemDeleted) {
        onItemDeleted(item.id);
      } else {
        router.refresh();
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete item",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
      setShowDeleteDialog(false);
    }
  };

  const displayName = item.quantity > 1 ? `${item.name} (${item.quantity})` : item.name;

  // Calculate lowest price for each store
  const getLowestPriceForStore = (store: string): number | null => {
    const storeLinks = item.productLinks.filter((link) => link.store.toLowerCase() === store.toLowerCase());
    if (storeLinks.length === 0) return null;
    
    const prices = storeLinks
      .map((link) => link.discountPrice ?? link.regularPrice)
      .filter((p): p is number => p !== null);
    
    return prices.length > 0 ? Math.min(...prices) : null;
  };

  const woolworthsPricePerUnit = getLowestPriceForStore("woolworths");
  const colesPricePerUnit = getLowestPriceForStore("coles");
  const aldiPricePerUnit = getLowestPriceForStore("aldi");

  // Multiply by quantity to get total price for this item
  const woolworthsPrice = woolworthsPricePerUnit !== null ? woolworthsPricePerUnit * item.quantity : null;
  const colesPrice = colesPricePerUnit !== null ? colesPricePerUnit * item.quantity : null;
  const aldiPrice = aldiPricePerUnit !== null ? aldiPricePerUnit * item.quantity : null;

  // Find overall lowest total price (already multiplied by quantity)
  const allPrices = [woolworthsPrice, colesPrice, aldiPrice].filter((p): p is number => p !== null);
  const overallLowest = allPrices.length > 0 ? Math.min(...allPrices) : null;

  const PriceDisplay = ({ store, price }: { store: string; price: number | null }) => {
    if (price === null) return null;
    
    const isLowest = price === overallLowest;
    const storeLower = store.toLowerCase();
    
    // Check if this store has a discount price
    const storeLinks = item.productLinks.filter((link) => link.store.toLowerCase() === storeLower);
    const hasDiscount = storeLinks.some((link) => link.discountPrice !== null);
    
    // Check if any of the prices for this store are stale
    const isStale = storeLinks.some((link) => isPriceStale(link.lastRefreshed));
    
    return (
      <div className={`flex items-center gap-1 ${isLowest && !isStale ? "font-semibold text-primary" : ""} ${isStale ? "opacity-40" : ""}`}>
        <Image
          src={`/store_icons/${storeLower}.webp`}
          alt={store}
          width={20}
          height={20}
          className="object-contain"
          loading="eager"
        />
        {hasDiscount ? (
          <Badge className={`${isStale ? "bg-gray-400 text-white" : "bg-discount text-black"}`} style={{ fontSize: '1rem', padding: '0.2rem 0.375rem' }}>
            ${price.toFixed(2)}
          </Badge>
        ) : (
          <span className={isLowest && !isStale ? "text-primary" : ""}>${price.toFixed(2)}</span>
        )}
      </div>
    );
  };

  return (
    <div className="flex items-center gap-2 border-b last:border-b-0 px-3 hover:bg-accent">
      {isEditMode && (
        <Button variant="ghost" size="icon" className="cursor-grab">
          <GripVertical className="h-4 w-4" />
        </Button>
      )}
      <button
        onClick={onToggleComplete}
        className="flex-1 text-left"
        disabled={isEditMode}
      >
        <div className={`flex items-center gap-2 ${item.isCompleted ? "line-through" : ""}`}>
          <span className="font-medium">{displayName}</span>
        </div>
        {item.notes && (
          <p className="text-sm text-muted-foreground mt-1">{item.notes}</p>
        )}
      </button>
      <div className="flex items-center gap-3 ml-auto">
        <PriceDisplay store="woolworths" price={woolworthsPrice} />
        <PriceDisplay store="coles" price={colesPrice} />
        <PriceDisplay store="aldi" price={aldiPrice} />
      </div>
      {isEditMode ? (
        <Button variant="ghost" size="icon" onClick={handleDeleteClick}>
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      ) : (
        <Link href={`/grocery-items/${item.id}`}>
          <Button variant="ghost" size="icon">
            <Info className="h-4 w-4" />
          </Button>
        </Link>
      )}

      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Item</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{item.name}&quot;?
              {shoppingListCount !== null && shoppingListCount > 1 && (
                <span className="block mt-2 font-semibold">
                  This item is on {shoppingListCount} shopping lists.
                </span>
              )}
              {" "}This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
