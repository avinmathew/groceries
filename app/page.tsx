import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export default async function Home() {
  // Check if there's a last visited shopping list in cookies
  const cookieStore = await cookies();
  const lastListId = cookieStore.get("lastShoppingListId")?.value;
  
  if (lastListId) {
    redirect(`/shopping-lists/${lastListId}`);
  } else {
    redirect("/shopping-lists");
  }
}
