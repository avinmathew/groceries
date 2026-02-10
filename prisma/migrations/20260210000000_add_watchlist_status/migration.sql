-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

-- Create new table with status column
CREATE TABLE "new_shopping_list_items" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "completedAt" DATETIME,
    "groceryItemId" TEXT NOT NULL,
    "shoppingListId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "shopping_list_items_groceryItemId_fkey" FOREIGN KEY ("groceryItemId") REFERENCES "grocery_items" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "shopping_list_items_shoppingListId_fkey" FOREIGN KEY ("shoppingListId") REFERENCES "shopping_lists" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Copy data from old table, converting isCompleted boolean to status string
INSERT INTO "new_shopping_list_items" ("id", "quantity", "notes", "status", "completedAt", "groceryItemId", "shoppingListId", "createdAt", "updatedAt")
SELECT "id", "quantity", "notes", 
    CASE WHEN "isCompleted" = 1 THEN 'completed' ELSE 'active' END,
    "completedAt", "groceryItemId", "shoppingListId", "createdAt", "updatedAt"
FROM "shopping_list_items";

-- Drop old table
DROP TABLE "shopping_list_items";

-- Rename new table to original name
ALTER TABLE "new_shopping_list_items" RENAME TO "shopping_list_items";

-- Recreate unique index
CREATE UNIQUE INDEX "shopping_list_items_groceryItemId_shoppingListId_key" ON "shopping_list_items"("groceryItemId", "shoppingListId");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
