import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { EditShoppingListView } from "@/components/edit-shopping-list-view";

async function getShoppingList(id: string) {
  return await prisma.shoppingList.findUnique({
    where: { id },
  });
}

export default async function EditShoppingListPage({ params }: { params: { id: string } }) {
  const shoppingList = await getShoppingList(params.id);

  if (!shoppingList) {
    notFound();
  }

  return <EditShoppingListView shoppingList={shoppingList} />;
}
