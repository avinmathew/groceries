"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Plus, Trash2, GripVertical } from "lucide-react";
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

type Category = {
  id: string;
  name: string;
  order: number;
};

export function EditCategoriesView({ initialCategories }: { initialCategories: Category[] }) {
  const [categories, setCategories] = useState(initialCategories);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) return;

    setIsAdding(true);
    try {
      const response = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newCategoryName.trim() }),
      });

      if (!response.ok) throw new Error("Failed to create category");

      const newCategory = await response.json();
      setCategories([...categories, newCategory]);
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
      const response = await fetch(`/api/categories/${categoryId}`, {
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
        <div className="space-y-2">
          {categories.map((category) => (
            <div
              key={category.id}
              className="flex items-center gap-2 rounded-lg border px-4 py-2 hover:bg-accent"
            >
              <Button variant="ghost" size="icon" className="cursor-grab">
                <GripVertical className="h-5 w-5" />
              </Button>
              <h2 className="flex-1 text-lg font-medium">{category.name}</h2>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleDeleteCategory(category.id)}
              >
                <Trash2 className="h-5 w-5 text-destructive" />
              </Button>
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
