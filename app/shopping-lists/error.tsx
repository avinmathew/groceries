"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Shopping lists error:", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b bg-background">
        <div className="container mx-auto flex h-14 items-center justify-between px-4">
          <Link href="/">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <h1 className="text-xl font-semibold">Shopping Lists</h1>
          <div className="w-10" />
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <div className="max-w-md mx-auto text-center space-y-4">
          <h2 className="text-xl font-semibold text-destructive">Error Loading Shopping Lists</h2>
          <p className="text-muted-foreground">
            Failed to load shopping lists. Please try again.
          </p>
          {error.message && (
            <p className="text-sm text-muted-foreground bg-muted p-3 rounded">
              {error.message}
            </p>
          )}
          <div className="flex gap-2 justify-center">
            <Button onClick={reset}>Try again</Button>
            <Link href="/">
              <Button variant="outline">Go home</Button>
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
