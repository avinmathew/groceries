import { prisma } from "@/lib/db";
import { EditCategoriesView } from "@/components/edit-categories-view";

async function getCategories() {
  return await prisma.category.findMany({
    orderBy: { order: "asc" },
  });
}

export default async function EditCategoriesPage() {
  const categories = await getCategories();
  return <EditCategoriesView initialCategories={categories} />;
}
