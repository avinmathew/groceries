"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { updateShoppingList } from "@/app/actions/shopping-lists";

type ShoppingList = {
  id: string;
  name: string;
};

export function EditShoppingListView({ shoppingList }: { shoppingList: ShoppingList }) {
  const [name, setName] = useState(shoppingList.name);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  const handleSave = async () => {
    if (!name.trim()) {
      toast({
        title: "Error",
        description: "Name cannot be empty",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    try {
      const result = await updateShoppingList(shoppingList.id, name.trim());

      if (!result.success) {
        throw new Error(result.error || "Failed to update shopping list");
      }

      toast({
        title: "Success",
        description: "Shopping list updated successfully",
      });
      router.push("/shopping-lists");
      router.refresh();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update shopping list",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/shopping-lists/${shoppingList.id}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Failed to delete shopping list");

      toast({
        title: "Success",
        description: "Shopping list deleted successfully",
      });
      router.push("/shopping-lists");
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete shopping list",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
      setShowDeleteDialog(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 items-center justify-between px-4">
          <Link href={`/shopping-lists/${shoppingList.id}`}>
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <h1 className="text-xl font-semibold">Edit Shopping List</h1>
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
              placeholder="Shopping list name"
            />
          </div>

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => router.back()}>
              Cancel
            </Button>
            <div className="flex gap-2">
              <Button variant="destructive" onClick={() => setShowDeleteDialog(true)}>
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </Button>
              <Button onClick={handleSave} disabled={isSaving || !name.trim()}>
                Save
              </Button>
            </div>
          </div>
        </div>
      </main>

      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Shopping List</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this shopping list? This action cannot be undone.
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
