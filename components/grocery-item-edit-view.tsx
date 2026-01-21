"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Plus, Trash2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { BASE_PATH } from "@/lib/utils";

type Category = {
  id: string;
  name: string;
};

type ProductLink = {
  id: string;
  url: string;
  store: string;
  regularPrice: number | null;
  discountPrice: number | null;
  lastRefreshed: string | null;
};

type PriceHistoryEntry = {
  id: string;
  regularPrice: number | null;
  discountPrice: number | null;
  recordedAt: string;
  store: string;
  productLinkId: string;
};

type GroceryItem = {
  id: string;
  groceryItemId: string;
  name: string;
  quantity: number;
  notes: string | null;
  categoryId: string | null;
  category: Category | null;
  productLinks: ProductLink[];
  shoppingList: {
    id: string;
    name: string;
  };
  shoppingListCount?: number;
};

function CombinedPriceHistoryTable({ priceHistory }: { priceHistory: PriceHistoryEntry[] }) {
  // Group price history by date (day level, ignoring time)
  type DayData = { date: string; stores: Record<string, number[]> };
  const groupedByDate = priceHistory.reduce((acc: Record<string, DayData>, entry) => {
    const date = new Date(entry.recordedAt);
    const dateKey = date.toISOString().split("T")[0]; // YYYY-MM-DD format
    
    if (!acc[dateKey]) {
      acc[dateKey] = {
        date: dateKey,
        stores: {} as Record<string, number[]>,
      };
    }
    
    const store = entry.store.toLowerCase();
    const price = entry.discountPrice || entry.regularPrice;
    
    if (price !== null) {
      if (!acc[dateKey].stores[store]) {
        acc[dateKey].stores[store] = [];
      }
      acc[dateKey].stores[store].push(price);
    }
    
    return acc;
  }, {} as Record<string, DayData>);

  // Convert to array and sort by date (newest first)
  const sortedDates = Object.values(groupedByDate).sort((a: DayData, b: DayData) => 
    new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatPriceRange = (prices: number[]): string => {
    if (prices.length === 0) return "-";
    if (prices.length === 1) return `$${prices[0].toFixed(2)}`;
    
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    
    if (min === max) {
      return `$${min.toFixed(2)}`;
    }
    
    return `$${min.toFixed(2)} - $${max.toFixed(2)}`;
  };

  const getPriceForStore = (stores: Record<string, number[]>, storeName: string): string => {
    const prices = stores[storeName.toLowerCase()];
    return prices ? formatPriceRange(prices) : "-";
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b">
            <th className="text-left p-3 font-semibold">Date</th>
            <th className="text-right p-3 font-semibold">Woolworths</th>
            <th className="text-right p-3 font-semibold">Coles</th>
            <th className="text-right p-3 font-semibold">Aldi</th>
          </tr>
        </thead>
        <tbody>
          {sortedDates.map((dayData: DayData) => (
            <tr key={dayData.date} className="border-b hover:bg-muted/50">
              <td className="p-3">{formatDate(dayData.date)}</td>
              <td className="text-right p-3">
                {getPriceForStore(dayData.stores, "woolworths")}
              </td>
              <td className="text-right p-3">
                {getPriceForStore(dayData.stores, "coles")}
              </td>
              <td className="text-right p-3">
                {getPriceForStore(dayData.stores, "aldi")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function GroceryItemEditView({
  item: initialItem,
  categories,
}: {
  item: GroceryItem;
  categories: Category[];
}) {
  const [name, setName] = useState(initialItem.name);
  const [quantity, setQuantity] = useState(initialItem.quantity);
  const [notes, setNotes] = useState(initialItem.notes || "");
  // Use "uncategorised" as a special value instead of empty string for Select
  const [categoryId, setCategoryId] = useState(initialItem.categoryId || "uncategorised");
  const [productLinks, setProductLinks] = useState(initialItem.productLinks);
  const [newLinkUrl, setNewLinkUrl] = useState("");
  const [newLinkStore, setNewLinkStore] = useState<"woolworths" | "coles" | "aldi">("woolworths");
  const [isSaving, setIsSaving] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [priceHistory, setPriceHistory] = useState<PriceHistoryEntry[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout>();
  const router = useRouter();
  const { toast } = useToast();

  const loadPriceHistory = useCallback(async () => {
    setIsLoadingHistory(true);
    try {
      const response = await fetch(`${BASE_PATH}/api/grocery-items/${initialItem.groceryItemId}/price-history`);
      if (response.ok) {
        const history = await response.json();
        setPriceHistory(history);
      }
    } catch (error) {
      console.error("Error loading price history:", error);
    } finally {
      setIsLoadingHistory(false);
    }
  }, [initialItem.groceryItemId]);

  // Load price history on mount
  useEffect(() => {
    loadPriceHistory();
  }, [loadPriceHistory]);

  const saveField = useCallback(async (fieldData?: Partial<{name: string; quantity: number; notes: string; categoryId: string}>) => {
    // Prepare the data to save
    const dataToSave = fieldData || {
      name: name.trim(),
      quantity,
      notes: notes.trim() || null,
      categoryId: categoryId === "uncategorised" ? null : categoryId,
    };

    // Don't save if name is empty
    if (!dataToSave.name || !dataToSave.name.trim()) {
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch(`${BASE_PATH}/api/grocery-items/${initialItem.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: dataToSave.name.trim(),
          quantity: dataToSave.quantity,
          notes: dataToSave.notes || null,
          categoryId: dataToSave.categoryId === "uncategorised" ? null : dataToSave.categoryId,
        }),
      });

      if (!response.ok) throw new Error("Failed to update grocery item");
      
      // Refresh the router to revalidate data
      router.refresh();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save changes",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  }, [initialItem.id, toast, router]);

  const handleAddLink = async () => {
    if (!newLinkUrl.trim()) return;

    try {
      const response = await fetch(`${BASE_PATH}/api/product-links`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: newLinkUrl.trim(),
          store: newLinkStore,
          groceryItemId: initialItem.groceryItemId,
        }),
      });

      if (!response.ok) throw new Error("Failed to add product link");

      const newLink = await response.json();
      setProductLinks([...productLinks, newLink]);
      setNewLinkUrl("");
      toast({
        title: "Success",
        description: "Product link added",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to add product link",
        variant: "destructive",
      });
    }
  };

  const handleDeleteLink = async (linkId: string) => {
    try {
      const response = await fetch(`${BASE_PATH}/api/product-links/${linkId}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Failed to delete product link");

      setProductLinks(productLinks.filter((link) => link.id !== linkId));
      toast({
        title: "Success",
        description: "Product link deleted",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete product link",
        variant: "destructive",
      });
    }
  };

  const handleRefreshPrices = async () => {
    setIsRefreshing(true);
    try {
      // Start the refresh process in the background
      const response = await fetch(`${BASE_PATH}/api/refresh-prices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groceryItemId: initialItem.groceryItemId }),
      });

      if (!response.ok) throw new Error("Failed to start price refresh");

      // Poll for updates every 3 seconds for up to 2 minutes
      const pollInterval = 3000; // 3 seconds
      const maxDuration = 120000; // 2 minutes
      const startTime = Date.now();
      
      const pollForUpdates = async () => {
        const elapsed = Date.now() - startTime;
        
        // Fetch updated data
        const updatedItemResponse = await fetch(`${BASE_PATH}/api/grocery-items/${initialItem.groceryItemId}`);
        if (updatedItemResponse.ok) {
          const updatedItem = await updatedItemResponse.json();
          const refreshedLinks = updatedItem.data?.productLinks ?? updatedItem.productLinks ?? [];
          setProductLinks(refreshedLinks);
          await loadPriceHistory();
        }

        // Continue polling if we haven't exceeded max duration
        if (elapsed < maxDuration && isRefreshing) {
          setTimeout(pollForUpdates, pollInterval);
        } else {
          setIsRefreshing(false);
          toast({
            title: "Success",
            description: "Price refresh complete",
          });
          router.refresh();
        }
      };

      // Start polling after initial delay
      setTimeout(pollForUpdates, pollInterval);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to refresh prices",
        variant: "destructive",
      });
      setIsRefreshing(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const response = await fetch(`${BASE_PATH}/api/grocery-items/${initialItem.groceryItemId}?scope=all`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Failed to delete grocery item");

      toast({
        title: "Success",
        description: "Grocery item deleted successfully",
      });
      router.push(`/shopping-lists/${initialItem.shoppingList.id}`);
      router.refresh();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete grocery item",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
      setShowDeleteDialog(false);
    }
  };

  const displayName = quantity > 1 ? `${name} (${quantity})` : name;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b bg-background">
        <div className="container mx-auto flex h-14 items-center justify-between px-4">
          <Link href={`/shopping-lists/${initialItem.shoppingList.id}`}>
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <h1 className="text-xl font-semibold">Edit Item</h1>
          <div className="w-10" />
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-2xl">
        <div className="space-y-6">
          <div>
            <label className="text-sm font-medium mb-2 block">Name</label>
            <Input 
              value={name} 
              onChange={(e) => setName(e.target.value)} 
              onBlur={() => saveField({name, quantity, notes, categoryId})}
              placeholder="Item name" 
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-2 block">Quantity</label>
            <div className="flex items-center gap-4">
              <Button
                variant="outline"
                onClick={() => {
                  const newQty = Math.max(1, quantity - 1);
                  setQuantity(newQty);
                  saveField({name, quantity: newQty, notes, categoryId});
                }}
                disabled={quantity <= 1}
              >
                Less
              </Button>
              <span className="text-lg font-medium">{quantity}</span>
              <Button variant="outline" onClick={() => {
                const newQty = quantity + 1;
                setQuantity(newQty);
                saveField({name, quantity: newQty, notes, categoryId});
              }}>
                More
              </Button>
            </div>
            {quantity > 1 && (
              <p className="text-sm text-muted-foreground mt-2">
                Display name: {displayName}
              </p>
            )}
          </div>

          <div>
            <label className="text-sm font-medium mb-2 block">Category</label>
            <Select value={categoryId} onValueChange={(newCategoryId) => {
              setCategoryId(newCategoryId);
              saveField({name, quantity, notes, categoryId: newCategoryId});
            }}>
              <SelectTrigger>
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="uncategorised">Uncategorised</SelectItem>
                {categories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm font-medium mb-2 block">Notes</label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={() => saveField({name, quantity, notes, categoryId})}
              placeholder="Add notes"
              maxLength={500}
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium">Product Links</label>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRefreshPrices}
                disabled={isRefreshing}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
                Refresh Prices
              </Button>
            </div>
            <div className="space-y-2">
              {productLinks.map((link) => (
                <div
                  key={link.id}
                  className="flex items-center gap-2 rounded-lg border p-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium capitalize">{link.store}</span>
                      {link.discountPrice ? (
                        <>
                          <Badge className="bg-discount text-black">
                            ${link.discountPrice.toFixed(2)}
                          </Badge>
                          <span className="text-sm text-muted-foreground line-through">
                            ${link.regularPrice?.toFixed(2)}
                          </span>
                        </>
                      ) : link.regularPrice ? (
                        <Badge variant="secondary">${link.regularPrice.toFixed(2)}</Badge>
                      ) : (
                        <Badge variant="outline">No price</Badge>
                      )}
                      {link.lastRefreshed && (
                        <span className="text-xs text-muted-foreground">
                          {(() => {
                            const daysAgo = Math.floor((Date.now() - new Date(link.lastRefreshed).getTime()) / (1000 * 60 * 60 * 24));
                            return daysAgo === 0 ? 'today' : `${daysAgo} days ago`;
                          })()}
                        </span>
                      )}
                    </div>
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-muted-foreground hover:underline block truncate"
                      title={link.url}
                    >
                      {link.url}
                    </a>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDeleteLink(link.id)}
                    className="flex-shrink-0"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-2">
              <Input
                value={newLinkUrl}
                onChange={(e) => setNewLinkUrl(e.target.value)}
                placeholder="Product URL"
                className="flex-1"
              />
              <Select value={newLinkStore} onValueChange={(v: any) => setNewLinkStore(v)}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="woolworths">Woolworths</SelectItem>
                  <SelectItem value="coles">Coles</SelectItem>
                  <SelectItem value="aldi">Aldi</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={handleAddLink} disabled={!newLinkUrl.trim()}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="flex justify-between pt-4 border-t">
            <Button
              variant="destructive"
              onClick={() => setShowDeleteDialog(true)}
              disabled={isDeleting}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </Button>
            <Link href={`/shopping-lists/${initialItem.shoppingList.id}`}>
              <Button variant="outline">
                Back
              </Button>
            </Link>
          </div>

          {priceHistory.length > 0 && (
            <div className="pt-6 border-t">
              <h3 className="text-lg font-semibold mb-4">Price History</h3>
              <CombinedPriceHistoryTable priceHistory={priceHistory} />
            </div>
          )}
        </div>
      </main>

      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Grocery Item</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{initialItem.name}&quot;?
              {initialItem.shoppingListCount !== undefined && initialItem.shoppingListCount > 1 && (
                <span className="block mt-2 mb-2 font-semibold">
                  This item is on {initialItem.shoppingListCount} shopping lists.
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
