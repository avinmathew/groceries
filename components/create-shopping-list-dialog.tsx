"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useSync } from "@/lib/sync-provider";
import { queueMutation } from "@/lib/api-utils";
import { offlineDB } from "@/lib/offline-db";
import { BASE_PATH } from "@/lib/utils";

export function CreateShoppingListDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const { toast } = useToast();
  const { isOnline, sync } = useSync();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsLoading(true);
    try {
      await queueMutation(
        'POST',
        `${BASE_PATH}/api/shopping-lists`,
        { name: name.trim() },
        async () => {
          // Optimistic: add temporary list
          const tempId = `temp_${Date.now()}`;
          await offlineDB.shoppingLists.add({
            id: tempId,
            name: name.trim(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            _synced: false,
          });
          return null;
        }
      );

      setOpen(false);
      setName("");
      
      if (isOnline) {
        await sync();
      }
      
      toast({
        title: "Success",
        description: isOnline ? "Shopping list created successfully" : "List queued (offline)",
      });
      
      router.replace("/shopping-lists");
      router.refresh();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to create shopping list",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="icon">
          <Plus className="h-5 w-5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="inset-x-0 top-2 translate-x-0 translate-y-0 mx-auto w-[calc(100vw-1rem)] max-h-[calc(100dvh-2rem)] rounded-none sm:top-[50%] sm:left-[50%] sm:translate-x-[-50%] sm:translate-y-[-50%] sm:max-w-lg sm:max-h-[80vh] sm:rounded-lg">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create Shopping List</DialogTitle>
            <DialogDescription>Enter a name for your new shopping list.</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input
              placeholder="Shopping list name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading || !name.trim()}>
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
