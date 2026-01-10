"use client";

import Link from "next/link";
import Image from "next/image";
import { Info, Trash2, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useRouter } from "next/navigation";

type GroceryItem = {
  id: string;
  name: string;
  quantity: number;
  notes: string | null;
  isCompleted: boolean;
  productLinks: Array<{
    id: string;
    store: string;
    regularPrice: number | null;
    discountPrice: number | null;
  }>;
};

export function GroceryItemRow({
  item,
  isEditMode,
  onToggleComplete,
}: {
  item: GroceryItem;
  isEditMode: boolean;
  onToggleComplete: () => void;
}) {
  const { toast } = useToast();
  const router = useRouter();

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this item?")) return;

    try {
      const response = await fetch(`/api/grocery-items/${item.id}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Failed to delete item");

      toast({
        title: "Success",
        description: "Item deleted successfully",
      });
      router.refresh();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete item",
        variant: "destructive",
      });
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
    
    return (
      <div className={`flex items-center gap-1 ${isLowest ? "font-semibold text-primary" : ""}`}>
        <Image
          src={`/store_icons/${storeLower}.webp`}
          alt={store}
          width={20}
          height={20}
          className="object-contain"
        />
        <span className={isLowest ? "text-primary" : ""}>${price.toFixed(2)}</span>
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
        <Button variant="ghost" size="icon" onClick={handleDelete}>
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      ) : (
        <Link href={`/grocery-items/${item.id}`}>
          <Button variant="ghost" size="icon">
            <Info className="h-4 w-4" />
          </Button>
        </Link>
      )}
    </div>
  );
}
