/*
  Warnings:

  - You are about to drop the column `completedAt` on the `grocery_items` table. All the data in the column will be lost.
  - You are about to drop the column `isCompleted` on the `grocery_items` table. All the data in the column will be lost.
  - You are about to drop the column `notes` on the `grocery_items` table. All the data in the column will be lost.
  - You are about to drop the column `quantity` on the `grocery_items` table. All the data in the column will be lost.
  - You are about to drop the column `shoppingListId` on the `grocery_items` table. All the data in the column will be lost.

*/
-- CreateTable
CREATE TABLE "shopping_list_items" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "notes" TEXT,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" DATETIME,
    "groceryItemId" TEXT NOT NULL,
    "shoppingListId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "shopping_list_items_groceryItemId_fkey" FOREIGN KEY ("groceryItemId") REFERENCES "grocery_items" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "shopping_list_items_shoppingListId_fkey" FOREIGN KEY ("shoppingListId") REFERENCES "shopping_lists" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Migrate existing data from grocery_items to shopping_list_items
INSERT INTO "shopping_list_items" ("id", "quantity", "notes", "isCompleted", "completedAt", "groceryItemId", "shoppingListId", "createdAt", "updatedAt")
SELECT 
    "id" || '_item' as "id",
    "quantity",
    "notes",
    "isCompleted",
    "completedAt",
    "id" as "groceryItemId",
    "shoppingListId",
    "createdAt",
    "updatedAt"
FROM "grocery_items";

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_grocery_items" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "categoryId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "grocery_items_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_grocery_items" ("categoryId", "createdAt", "id", "name", "updatedAt") SELECT "categoryId", "createdAt", "id", "name", "updatedAt" FROM "grocery_items";
DROP TABLE "grocery_items";
ALTER TABLE "new_grocery_items" RENAME TO "grocery_items";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "shopping_list_items_groceryItemId_shoppingListId_key" ON "shopping_list_items"("groceryItemId", "shoppingListId");
