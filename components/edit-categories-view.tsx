"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, Trash2, GripVertical, Pencil, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { BASE_PATH } from "@/lib/utils";

type Category = {
  id: string;
  name: string;
  order: number;
};

export function EditCategoriesView({ initialCategories }: { initialCategories: Category[] }) {
  const [categories, setCategories] = useState(() => [...initialCategories].sort((a, b) => a.order - b.order));
  const [newCategoryName, setNewCategoryName] = useState("");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [isSavingOrder, setIsSavingOrder] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [savingRenameId, setSavingRenameId] = useState<string | null>(null);
  const { toast } = useToast();

  const reorderCategories = (draggedId: string, targetId: string) => {
    if (draggedId === targetId) return null;

    const draggedIndex = categories.findIndex((c) => c.id === draggedId);
    const targetIndex = categories.findIndex((c) => c.id === targetId);

    if (draggedIndex === -1 || targetIndex === -1) return null;

    const updated = [...categories];
    const [moved] = updated.splice(draggedIndex, 1);
    updated.splice(targetIndex, 0, moved);

    return updated.map((cat, index) => ({ ...cat, order: index }));
  };

  const persistCategoryOrder = async (nextCategories: Category[], previousCategories: Category[]) => {
    const previousOrderLookup = Object.fromEntries(previousCategories.map((cat) => [cat.id, cat.order]));
    const changed = nextCategories.filter((cat) => previousOrderLookup[cat.id] !== cat.order);
    if (!changed.length) return;

    setIsSavingOrder(true);
    try {
      await Promise.all(
        changed.map((cat) =>
          fetch(`${BASE_PATH}/api/categories/${cat.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ order: cat.order }),
          }),
        ),
      );

      toast({ title: "Success", description: "Category order updated" });
    } catch (error) {
      setCategories(previousCategories);
      toast({
        title: "Error",
        description: "Failed to update order",
        variant: "destructive",
      });
    } finally {
      setIsSavingOrder(false);
    }
  };

  const handleDropOn = async (targetId: string) => {
    if (!draggingId) return;

    const reordered = reorderCategories(draggingId, targetId);
    setDraggingId(null);
    setDragOverId(null);

    if (!reordered) return;

    const previous = categories;
    setCategories(reordered);
    await persistCategoryOrder(reordered, previous);
  };

  const startRenaming = (category: Category) => {
    setRenamingId(category.id);
    setRenameValue(category.name);
  };

  const cancelRenaming = () => {
    setRenamingId(null);
    setRenameValue("");
  };

  const handleRenameSave = async () => {
    if (!renamingId) return;
    const trimmed = renameValue.trim();

    if (!trimmed) {
      toast({
        title: "Name required",
        description: "Please enter a category name",
        variant: "destructive",
      });
      return;
    }

    setSavingRenameId(renamingId);
    try {
      const response = await fetch(`${BASE_PATH}/api/categories/${renamingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });

      if (!response.ok) throw new Error("Failed to rename category");

      const updatedCategory = await response.json();
      setCategories((prev) =>
        prev.map((cat) => (cat.id === renamingId ? { ...cat, name: updatedCategory.name } : cat)),
      );
      toast({ title: "Success", description: "Category renamed" });
      cancelRenaming();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to rename category",
        variant: "destructive",
      });
    } finally {
      setSavingRenameId(null);
    }
  };

  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) return;

    setIsAdding(true);
    try {
      const response = await fetch(`${BASE_PATH}/api/categories`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newCategoryName.trim() }),
      });

      if (!response.ok) throw new Error("Failed to create category");

      const newCategory = await response.json();
      setCategories((prev) => [...prev, newCategory].sort((a, b) => a.order - b.order));
      setNewCategoryName("");
      setShowAddDialog(false);
      toast({
        title: "Success",
        description: "Category created successfully",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to create category",
        variant: "destructive",
      });
    } finally {
      setIsAdding(false);
    }
  };

  const handleDeleteCategory = async (categoryId: string) => {
    if (!confirm("Are you sure you want to delete this category? Items in this category will become uncategorised.")) {
      return;
    }

    try {
      const response = await fetch(`${BASE_PATH}/api/categories/${categoryId}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Failed to delete category");

      setCategories(categories.filter((c) => c.id !== categoryId));
      toast({
        title: "Success",
        description: "Category deleted successfully",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete category",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b bg-background">
        <div className="container mx-auto flex h-14 items-center justify-between px-4">
          <Link href="/admin">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <h1 className="text-xl font-semibold">Edit Categories</h1>
          <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
            <DialogTrigger asChild>
              <Button size="icon">
                <Plus className="h-5 w-5" />
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Category</DialogTitle>
                <DialogDescription>Enter a name for the new category.</DialogDescription>
              </DialogHeader>
              <div className="py-4">
                <Input
                  placeholder="Category name"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleAddCategory();
                    }
                  }}
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowAddDialog(false)}>
                  Cancel
                </Button>
                <Button onClick={handleAddCategory} disabled={isAdding || !newCategoryName.trim()}>
                  Add
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      <main className="container mx-auto p-4">
        <div className="mb-3 flex items-center justify-between text-sm text-muted-foreground">
          {isSavingOrder && <span className="text-xs">Saving order...</span>}
        </div>
        <div className="space-y-2">
          {categories.map((category) => (
            <div
              key={category.id}
              onDragOver={(event) => {
                event.preventDefault();
                if (category.id !== draggingId) {
                  setDragOverId(category.id);
                }
              }}
              onDragLeave={() => setDragOverId(null)}
              onDrop={(event) => {
                event.preventDefault();
                handleDropOn(category.id);
              }}
              className={`flex items-center gap-2 rounded-lg border px-4 py-2 hover:bg-accent ${
                draggingId === category.id ? "opacity-60" : ""
              } ${dragOverId === category.id && draggingId !== category.id ? "border-primary bg-accent/60" : ""}`}
            >
              <Button
                variant="ghost"
                size="icon"
                className={renamingId !== null ? "cursor-not-allowed opacity-50" : "cursor-grab"}
                data-drag-handle="true"
                aria-label="Drag to reorder"
                draggable={renamingId === null}
                disabled={renamingId !== null}
                aria-disabled={renamingId !== null}
                title={renamingId !== null ? "Finish renaming to reorder" : "Drag to reorder"}
                onDragStart={(event) => {
                  if (renamingId !== null) {
                    event.preventDefault();
                    return;
                  }
                  setDraggingId(category.id);
                  if (event.dataTransfer) {
                    event.dataTransfer.setData("text/plain", category.id);
                    event.dataTransfer.dropEffect = "move";
                    event.dataTransfer.effectAllowed = "move";
                  }
                }}
                onDragEnd={() => {
                  setDraggingId(null);
                  setDragOverId(null);
                }}
              >
                <GripVertical className="h-5 w-5" />
              </Button>
              {renamingId === category.id ? (
                <>
                  <Input
                    className="flex-1"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleRenameSave();
                      }
                      if (e.key === "Escape") {
                        e.preventDefault();
                        cancelRenaming();
                      }
                    }}
                  />
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={cancelRenaming}
                      disabled={savingRenameId === category.id}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleRenameSave}
                      disabled={!renameValue.trim() || savingRenameId === category.id}
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <h2 className="flex-1 text-lg font-medium">{category.name}</h2>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => startRenaming(category)}
                      aria-label="Rename category"
                    >
                      <Pencil className="h-5 w-5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeleteCategory(category.id)}
                      aria-label="Delete category"
                    >
                      <Trash2 className="h-5 w-5 text-destructive" />
                    </Button>
                  </div>
                </>
              )}
            </div>
          ))}
          {categories.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              No categories yet. Add one to get started!
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
