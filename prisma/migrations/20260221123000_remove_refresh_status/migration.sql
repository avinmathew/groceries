-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_shopping_lists" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

INSERT INTO "new_shopping_lists" ("id", "name", "createdAt", "updatedAt")
SELECT "id", "name", "createdAt", "updatedAt"
FROM "shopping_lists";

DROP TABLE "shopping_lists";
ALTER TABLE "new_shopping_lists" RENAME TO "shopping_lists";

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
