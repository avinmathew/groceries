import Link from "next/link";
import { ArrowLeft, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AdminPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b bg-background">
        <div className="container mx-auto flex h-14 items-center justify-between px-4">
          <Link href="/shopping-lists">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <h1 className="text-xl font-semibold">Admin</h1>
          <div className="w-10" />
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <div className="space-y-4">
          <Link href="/admin/categories">
            <div className="flex items-center justify-between rounded-lg border px-4 py-2 hover:bg-accent min-h-[57px]">
              <div className="flex items-center gap-3">
                <Settings className="h-5 w-5" />
                <h2 className="text-lg font-medium">Categories</h2>
              </div>
            </div>
          </Link>
        </div>
      </main>
    </div>
  );
}
