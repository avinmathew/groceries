"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, Plus, Trash2, RefreshCw, Pencil } from "lucide-react";
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
  label?: string | null;
  perUnit?: number | null;
  regularPrice: number | null;
  discountPrice: number | null;
  lastRefreshed: string | null;
};

type StoreKey = "woolworths" | "coles" | "aldi";

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

const STORE_DISPLAY_NAMES: Record<StoreKey, string> = {
  woolworths: "Woolworths",
  coles: "Coles",
  aldi: "Aldi",
};

function PriceHistoryMatrixTable({
  productLinks,
  priceHistory,
}: {
  productLinks: ProductLink[];
  priceHistory: PriceHistoryEntry[];
}) {
  const storesInLinks = useMemo(() => {
    return new Set(productLinks.map((l) => l.store.toLowerCase()));
  }, [productLinks]);

  const showStoreIcon = storesInLinks.size > 1;

  const linkColumns = useMemo(() => {
    return productLinks.map((link) => {
      const trimmedLabel = typeof link.label === "string" ? link.label.trim() : "";
      const storeKey = link.store.toLowerCase() as StoreKey;
      const storeName = STORE_DISPLAY_NAMES[storeKey] ?? link.store;
      const title = trimmedLabel || storeName;

      return {
        id: link.id,
        storeLower: link.store.toLowerCase(),
        storeName,
        title,
      };
    });
  }, [productLinks]);

  const groupedByDay = useMemo(() => {
    const dayMap = new Map<string, Map<string, PriceHistoryEntry>>();

    for (const entry of priceHistory) {
      const dateKey = new Date(entry.recordedAt).toISOString().split("T")[0];

      if (!dayMap.has(dateKey)) dayMap.set(dateKey, new Map());
      const linksForDay = dayMap.get(dateKey)!;

      const existing = linksForDay.get(entry.productLinkId);
      if (!existing) {
        linksForDay.set(entry.productLinkId, entry);
        continue;
      }

      if (new Date(entry.recordedAt).getTime() > new Date(existing.recordedAt).getTime()) {
        linksForDay.set(entry.productLinkId, entry);
      }
    }

    return dayMap;
  }, [priceHistory]);

  const sortedDays = useMemo(() => {
    return [...groupedByDay.keys()].sort(
      (a, b) => new Date(b).getTime() - new Date(a).getTime(),
    );
  }, [groupedByDay]);

  if (sortedDays.length === 0) return null;

  const formatDay = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b">
            <th className="text-left p-3 font-semibold whitespace-nowrap">Date</th>
            {linkColumns.map((col) => (
              <th key={col.id} className="text-right p-3 font-semibold whitespace-nowrap">
                <div className="flex items-center justify-end gap-2">
                  {showStoreIcon ? (
                    <Image
                      src={`/store_icons/${col.storeLower}.webp`}
                      alt={col.storeName}
                      width={16}
                      height={16}
                      className="object-contain"
                      loading="eager"
                    />
                  ) : null}
                  <div className="flex flex-col items-end">
                    <span title={col.title}>{col.title}</span>
                  </div>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedDays.map((day) => {
            const linksForDay = groupedByDay.get(day) ?? new Map<string, PriceHistoryEntry>();

            return (
              <tr key={day} className="border-b hover:bg-muted/50">
                <td className="p-3 whitespace-nowrap">{formatDay(day)}</td>
                {linkColumns.map((col) => {
                  const entry = linksForDay.get(col.id);
                  const effective = entry ? entry.discountPrice ?? entry.regularPrice : null;

                  return (
                    <td key={col.id} className="p-3 text-right whitespace-nowrap">
                      {effective === null ? (
                        "-"
                      ) : entry && entry.discountPrice !== null ? (
                        <Badge className="bg-discount text-black">${entry.discountPrice.toFixed(2)}</Badge>
                      ) : (
                        <span>${effective.toFixed(2)}</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
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
  const [productLinkDialogMode, setProductLinkDialogMode] = useState<"create" | "edit" | null>(null);
  const [productLinkDialogLink, setProductLinkDialogLink] = useState<ProductLink | null>(null);
  const [productLinkUrl, setProductLinkUrl] = useState("");
  const [productLinkLabel, setProductLinkLabel] = useState("");
  const [productLinkPerUnit, setProductLinkPerUnit] = useState("");
  const [productLinkStore, setProductLinkStore] = useState<StoreKey>("woolworths");
  const [isSavingProductLink, setIsSavingProductLink] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showDeletePriceDialog, setShowDeletePriceDialog] = useState(false);
  const [priceToDelete, setPriceToDelete] = useState<{ linkId: string; priceType: 'discount' | 'regular'; store: string } | null>(null);
  const [priceHistory, setPriceHistory] = useState<PriceHistoryEntry[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout>();
  const router = useRouter();
  const { toast } = useToast();

  const perUnitBase = useMemo(() => {
    const perUnits = productLinks
      .map((link) => link.perUnit)
      .filter((value): value is number => typeof value === "number" && value > 0);

    if (!perUnits.length) return null;

    const minUnit = Math.min(...perUnits);
    const exponent = Math.floor(Math.log10(minUnit));
    return Math.pow(10, exponent);
  }, [productLinks]);

  const getPerUnitDisplay = (link: ProductLink) => {
    if (!perUnitBase || !link.perUnit || link.perUnit <= 0) return null;
    const price = link.discountPrice ?? link.regularPrice;
    if (price === null) return null;
    const normalizedPrice = (price / link.perUnit) * perUnitBase;
    return `$${normalizedPrice.toFixed(2)}/${perUnitBase}`;
  };

  const getProductLinkDisplayName = (link: ProductLink) => {
    const trimmedLabel = typeof link.label === "string" ? link.label.trim() : "";
    if (trimmedLabel) return trimmedLabel;

    const storeKey = link.store.toLowerCase() as StoreKey;
    return STORE_DISPLAY_NAMES[storeKey] ?? link.store;
  };

  const sortedProductLinks = useMemo(() => {
    const storeOrder: Record<string, number> = {
      woolworths: 1,
      coles: 2,
      aldi: 3,
    };

    return [...productLinks].sort((a, b) => {
      const aStoreLower = a.store.toLowerCase();
      const bStoreLower = b.store.toLowerCase();
      const aStoreOrder = storeOrder[aStoreLower] ?? 999;
      const bStoreOrder = storeOrder[bStoreLower] ?? 999;

      if (aStoreOrder !== bStoreOrder) {
        return aStoreOrder - bStoreOrder;
      }

      // Secondary sort by display name
      const aName = getProductLinkDisplayName(a).toLowerCase();
      const bName = getProductLinkDisplayName(b).toLowerCase();
      return aName.localeCompare(bName);
    });
  }, [productLinks]);

  const closeProductLinkDialog = () => {
    setProductLinkDialogMode(null);
    setProductLinkDialogLink(null);
    setProductLinkUrl("");
    setProductLinkLabel("");
    setProductLinkPerUnit("");
    setProductLinkStore("woolworths");
    setIsSavingProductLink(false);
  };

  const detectStoreFromUrl = (url: string): StoreKey => {
    const urlLower = url.toLowerCase();
    if (urlLower.includes('woolworths.com')) return 'woolworths';
    if (urlLower.includes('coles.com')) return 'coles';
    if (urlLower.includes('aldi.com')) return 'aldi';
    return 'woolworths'; // default
  };

  const openCreateProductLinkDialog = () => {
    setProductLinkDialogMode("create");
    setProductLinkDialogLink(null);
    setProductLinkUrl("");
    setProductLinkLabel("");
    setProductLinkPerUnit("");
    setProductLinkStore("woolworths");
  };

  const openEditProductLinkDialog = (link: ProductLink) => {
    const storeValue: StoreKey = ("woolworths" === link.store || "coles" === link.store || "aldi" === link.store)
      ? (link.store as StoreKey)
      : "woolworths";

    setProductLinkDialogMode("edit");
    setProductLinkDialogLink(link);
    setProductLinkUrl(link.url);
    setProductLinkLabel(link.label ?? "");
    setProductLinkPerUnit(link.perUnit !== null && link.perUnit !== undefined ? String(link.perUnit) : "");
    setProductLinkStore(storeValue);
  };

  const refreshProductLinks = useCallback(async () => {
    try {
      const response = await fetch(`${BASE_PATH}/api/grocery-items/${initialItem.groceryItemId}`, {
        cache: "no-store",
        headers: {
          "Cache-Control": "no-cache",
        },
      });

      if (!response.ok) return;
      const data = await response.json();
      const refreshedLinks = data.data?.productLinks ?? data.productLinks ?? [];
      setProductLinks(refreshedLinks);
    } catch (error) {
      console.error("Error refreshing product links:", error);
    }
  }, [initialItem.groceryItemId]);

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

  // Ensure product links refresh when returning to the page
  useEffect(() => {
    refreshProductLinks();

    const handleFocus = () => {
      refreshProductLinks();
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        refreshProductLinks();
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [refreshProductLinks]);

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
  }, [initialItem.id, toast, router, name, quantity, notes, categoryId]);

  const handleUpdateLink = async (
    linkId: string,
    updates: { url?: string; store?: string; label?: string | null; perUnit?: number | null }
  ): Promise<boolean> => {
    const existing = productLinks.find((link) => link.id === linkId);
    if (!existing) return false;

    const normalizedUpdates: { url?: string; store?: string; label?: string | null; perUnit?: number | null } = {};

    if (updates.url !== undefined) {
      const trimmedUrl = updates.url.trim();
      if (!trimmedUrl) {
        toast({
          title: "URL required",
          description: "Please enter a product URL",
          variant: "destructive",
        });
        return false;
      }
      normalizedUpdates.url = trimmedUrl;
    }

    if (updates.store !== undefined) {
      normalizedUpdates.store = updates.store;
    }

    if (updates.label !== undefined) {
      const trimmedLabel = typeof updates.label === "string" ? updates.label.trim() : updates.label;
      normalizedUpdates.label = trimmedLabel || null;
    }

    if (updates.perUnit !== undefined) {
      if (updates.perUnit !== null && (updates.perUnit <= 0 || !Number.isFinite(updates.perUnit))) {
        toast({
          title: "Invalid per-unit value",
          description: "Per unit must be a positive number",
          variant: "destructive",
        });
        return false;
      }
      normalizedUpdates.perUnit = updates.perUnit;
    }

    try {
      const response = await fetch(`${BASE_PATH}/api/product-links/${linkId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(normalizedUpdates),
      });

      if (!response.ok) throw new Error("Failed to update product link");

      const updatedLink = await response.json();
      setProductLinks((prev) => prev.map((link) => (link.id === updatedLink.id ? updatedLink : link)));
      return true;
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update product link",
        variant: "destructive",
      });
      return false;
    }
  };

  const handleAddLink = async (args: {
    url: string;
    store: StoreKey;
    label: string;
    perUnit: string;
  }): Promise<boolean> => {
    const trimmedUrl = args.url.trim();
    if (!trimmedUrl) {
      toast({
        title: "URL required",
        description: "Please enter a product URL",
        variant: "destructive",
      });
      return false;
    }

    const trimmedLabel = args.label.trim();
    let parsedPerUnit: number | null = null;
    if (args.perUnit.trim() !== "") {
      const numericPerUnit = Number(args.perUnit);
      if (!Number.isFinite(numericPerUnit) || numericPerUnit <= 0) {
        toast({
          title: "Invalid per-unit value",
          description: "Per unit must be a positive number",
          variant: "destructive",
        });
        return false;
      }
      parsedPerUnit = numericPerUnit;
    }

    try {
      const response = await fetch(`${BASE_PATH}/api/product-links`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: trimmedUrl,
          store: args.store,
          groceryItemId: initialItem.groceryItemId,
          label: trimmedLabel || null,
          perUnit: parsedPerUnit,
        }),
      });

      if (!response.ok) throw new Error("Failed to add product link");

      const newLink = await response.json();
      setProductLinks((prev) => [...prev, newLink]);
      toast({
        title: "Success",
        description: "Product link added",
      });
      return true;
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to add product link",
        variant: "destructive",
      });
      return false;
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

  const handleDeletePrice = async () => {
    if (!priceToDelete) return;

    try {
      const link = productLinks.find(l => l.id === priceToDelete.linkId);
      if (!link) return;

      // Find the most recent price history entry for this product link that matches the current price
      const linkHistory = priceHistory
        .filter(h => h.productLinkId === priceToDelete.linkId)
        .sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime());
      
      // Find the most recent entry that matches the price being deleted
      const currentPriceEntry = linkHistory.find(h => {
        if (priceToDelete.priceType === 'discount') {
          return h.discountPrice === link.discountPrice;
        } else {
          return h.regularPrice === link.regularPrice && h.discountPrice === null;
        }
      });

      // Delete the price history entry if found
      if (currentPriceEntry) {
        await fetch(`${BASE_PATH}/api/product-links/${priceToDelete.linkId}/price-history?entryId=${currentPriceEntry.id}`, {
          method: "DELETE",
        });
      }

      // Find the most recent historical entry (excluding the one we're deleting)
      const mostRecentHistoricalEntry = linkHistory.find(h => {
        return h.id !== currentPriceEntry?.id;
      });

      const updateData: { regularPrice?: null; discountPrice?: null; lastRefreshed?: string | null } = {};
      if (priceToDelete.priceType === 'discount') {
        updateData.discountPrice = null;
      } else {
        updateData.regularPrice = null;
      }
      
      // Update lastRefreshed to the most recent historical entry, or null if none exists
      updateData.lastRefreshed = mostRecentHistoricalEntry?.recordedAt || null;

      const response = await fetch(`${BASE_PATH}/api/product-links/${priceToDelete.linkId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updateData),
      });

      if (!response.ok) throw new Error("Failed to delete price");

      const updatedLink = await response.json();
      setProductLinks(productLinks.map(l => l.id === updatedLink.id ? updatedLink : l));
      await loadPriceHistory();
      
      toast({
        title: "Success",
        description: "Price deleted successfully",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete price",
        variant: "destructive",
      });
    } finally {
      setShowDeletePriceDialog(false);
      setPriceToDelete(null);
    }
  };

  const handleRefreshPrices = async () => {
    setIsRefreshing(true);
    try {
      // Start the refresh process in the background (returns immediately)
      const response = await fetch(`${BASE_PATH}/api/refresh-prices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groceryItemId: initialItem.groceryItemId }),
      });

      if (!response.ok) throw new Error("Failed to start price refresh");

      // Show immediate feedback
      toast({
        title: "Refreshing prices...",
        description: "Prices will update as they are fetched",
      });

      // Poll for updates every 3 seconds for up to 2 minutes
      const pollInterval = 3000; // 3 seconds
      const maxDuration = 120000; // 2 minutes
      const startTime = Date.now();
      
      const pollForUpdates = async () => {
        const elapsed = Date.now() - startTime;
        
        // Fetch updated data
        const updatedItemResponse = await fetch(`${BASE_PATH}/api/grocery-items/${initialItem.groceryItemId}`, {
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache',
          },
        });
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
              autoCapitalize="none"
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
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={openCreateProductLinkDialog}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Link
                </Button>
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
            </div>
            <div className="space-y-2">
              {sortedProductLinks.map((link) => {
                const perUnitDisplay = getPerUnitDisplay(link);
                const displayName = getProductLinkDisplayName(link);
                const storeLower = link.store.toLowerCase();

                return (
                  <div
                    key={link.id}
                    className="flex items-center gap-2 rounded-lg border p-3"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Image
                          src={`/store_icons/${storeLower}.webp`}
                          alt={link.store}
                          width={20}
                          height={20}
                          className="object-contain"
                          loading="eager"
                        />
                        {displayName ? <span className="font-medium">{displayName}</span> : null}
                        {link.discountPrice ? (
                          <>
                            <Badge 
                              className="bg-discount text-black cursor-pointer hover:opacity-80"
                              onClick={() => {
                                setPriceToDelete({ linkId: link.id, priceType: 'discount', store: link.store });
                                setShowDeletePriceDialog(true);
                              }}
                              title="Click to delete this price"
                            >
                              ${link.discountPrice.toFixed(2)}
                            </Badge>
                            <span 
                              className="text-sm text-muted-foreground line-through cursor-pointer hover:opacity-80"
                              onClick={() => {
                                setPriceToDelete({ linkId: link.id, priceType: 'regular', store: link.store });
                                setShowDeletePriceDialog(true);
                              }}
                              title="Click to delete this price"
                            >
                              ${link.regularPrice?.toFixed(2)}
                            </span>
                          </>
                        ) : link.regularPrice ? (
                          <Badge 
                            variant="secondary" 
                            className="cursor-pointer hover:opacity-80"
                            onClick={() => {
                              setPriceToDelete({ linkId: link.id, priceType: 'regular', store: link.store });
                              setShowDeletePriceDialog(true);
                            }}
                            title="Click to delete this price"
                          >
                            ${link.regularPrice.toFixed(2)}
                          </Badge>
                        ) : (
                          <Badge variant="outline">No price</Badge>
                        )}
                        {perUnitDisplay && (
                          <span className="text-xs text-muted-foreground">
                            {perUnitDisplay}
                          </span>
                        )}
                        {link.lastRefreshed && (link.regularPrice !== null || link.discountPrice !== null) && (
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
                      onClick={() => openEditProductLinkDialog(link)}
                      className="flex-shrink-0"
                      title="Edit product link"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeleteLink(link.id)}
                      className="flex-shrink-0"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })}
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
              <PriceHistoryMatrixTable productLinks={productLinks} priceHistory={priceHistory} />
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

      <Dialog open={showDeletePriceDialog} onOpenChange={setShowDeletePriceDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Price</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the {priceToDelete?.priceType} price for {priceToDelete?.store}? This is useful if the scraper recorded an incorrect price.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowDeletePriceDialog(false);
              setPriceToDelete(null);
            }}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeletePrice}>
              Delete Price
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={productLinkDialogMode !== null}
        onOpenChange={(open) => {
          if (!open) closeProductLinkDialog();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{productLinkDialogMode === "create" ? "Add Product Link" : "Edit Product Link"}</DialogTitle>
            <DialogDescription>
              {productLinkDialogMode === "create"
                ? "Enter the product URL. The store will be detected automatically."
                : "Update the store, URL, label, and per-unit quantity."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-sm font-medium mb-1 block">URL</label>
              <Input 
                value={productLinkUrl} 
                onChange={(e) => {
                  const newUrl = e.target.value;
                  setProductLinkUrl(newUrl);
                  if (productLinkDialogMode === "create" && newUrl.trim()) {
                    const detectedStore = detectStoreFromUrl(newUrl);
                    setProductLinkStore(detectedStore);
                  }
                }} 
                placeholder="https://..." 
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Store</label>
              <Select value={productLinkStore} onValueChange={(v: any) => setProductLinkStore(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="woolworths">Woolworths</SelectItem>
                  <SelectItem value="coles">Coles</SelectItem>
                  <SelectItem value="aldi">Aldi</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Label</label>
              <Input value={productLinkLabel} onChange={(e) => setProductLinkLabel(e.target.value)} placeholder="Optional" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Per unit</label>
              <Input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={productLinkPerUnit}
                onChange={(e) => setProductLinkPerUnit(e.target.value)}
                placeholder="Optional"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={closeProductLinkDialog}
              disabled={isSavingProductLink}
            >
              Cancel
            </Button>
            <Button
              onClick={async () => {
                const trimmedUrl = productLinkUrl.trim();
                if (!trimmedUrl) {
                  toast({
                    title: "URL required",
                    description: "Please enter a product URL",
                    variant: "destructive",
                  });
                  return;
                }

                setIsSavingProductLink(true);

                if (productLinkDialogMode === "create") {
                  const didCreate = await handleAddLink({
                    url: trimmedUrl,
                    store: productLinkStore,
                    label: productLinkLabel,
                    perUnit: productLinkPerUnit,
                  });
                  setIsSavingProductLink(false);
                  if (didCreate) closeProductLinkDialog();
                  return;
                }

                if (!productLinkDialogLink) {
                  setIsSavingProductLink(false);
                  return;
                }

                const trimmedLabel = productLinkLabel.trim();
                let parsedPerUnit: number | null = null;
                if (productLinkPerUnit.trim() !== "") {
                  const numericPerUnit = Number(productLinkPerUnit);
                  if (!Number.isFinite(numericPerUnit) || numericPerUnit <= 0) {
                    toast({
                      title: "Invalid per-unit value",
                      description: "Per unit must be a positive number",
                      variant: "destructive",
                    });
                    setIsSavingProductLink(false);
                    return;
                  }
                  parsedPerUnit = numericPerUnit;
                }

                const didUpdate = await handleUpdateLink(productLinkDialogLink.id, {
                  url: trimmedUrl,
                  store: productLinkStore,
                  label: trimmedLabel || null,
                  perUnit: parsedPerUnit,
                });
                setIsSavingProductLink(false);
                if (didUpdate) closeProductLinkDialog();
              }}
              disabled={isSavingProductLink}
            >
              {isSavingProductLink ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
