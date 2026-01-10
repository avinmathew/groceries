import Link from "next/link";
import { Settings, Plus, Info } from "lucide-react";
import { prisma } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CreateShoppingListDialog } from "@/components/create-shopping-list-dialog";

async function getShoppingLists() {
  return await prisma.shoppingList.findMany({
    include: {
      items: {
        where: {
          isCompleted: false,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}

export default async function ShoppingListsPage() {
  const shoppingLists = await getShoppingLists();

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto flex h-14 items-center justify-between px-4">
          <h1 className="text-xl font-semibold">MyGroceries</h1>
          <div className="flex items-center gap-2">
            <Link href="/admin">
              <Button variant="ghost" size="icon">
                <Settings className="h-5 w-5" />
              </Button>
            </Link>
            <CreateShoppingListDialog />
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <div className="space-y-2">
          {shoppingLists.map((list) => (
            <div
              key={list.id}
              className="flex items-center justify-between rounded-lg border px-4 py-2 hover:bg-accent"
            >
              <Link href={`/shopping-lists/${list.id}`} className="flex-1">
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-medium">{list.name}</h2>
                  <Badge variant="secondary">{list.items.length}</Badge>
                </div>
              </Link>
              <Link href={`/shopping-lists/${list.id}/edit`}>
                <Button variant="ghost" size="icon">
                  <Info className="h-5 w-5" />
                </Button>
              </Link>
            </div>
          ))}
          {shoppingLists.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              No shopping lists yet. Create one to get started!
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
