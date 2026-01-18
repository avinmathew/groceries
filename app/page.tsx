"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    // Check if there's a last visited shopping list
    const lastListId = localStorage.getItem("lastShoppingListId");
    
    if (lastListId) {
      router.replace(`/shopping-lists/${lastListId}`);
    } else {
      router.replace("/shopping-lists");
    }
  }, [router]);

  return null;
}
