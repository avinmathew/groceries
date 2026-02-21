CREATE TABLE "refresh_jobs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "status" TEXT NOT NULL DEFAULT 'running',
    "scopeType" TEXT NOT NULL,
    "shoppingListId" TEXT,
    "groceryItemId" TEXT,
    "totalLinks" INTEGER NOT NULL DEFAULT 0,
    "processedLinks" INTEGER NOT NULL DEFAULT 0,
    "successfulLinks" INTEGER NOT NULL DEFAULT 0,
    "failedLinks" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "refresh_jobs_shoppingListId_fkey" FOREIGN KEY ("shoppingListId") REFERENCES "shopping_lists" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "refresh_jobs_groceryItemId_fkey" FOREIGN KEY ("groceryItemId") REFERENCES "grocery_items" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "refresh_job_links" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "refreshJobId" TEXT NOT NULL,
    "productLinkId" TEXT NOT NULL,
    "groceryItemId" TEXT NOT NULL,
    "store" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "startedAt" DATETIME,
    "finishedAt" DATETIME,
    "regularPrice" REAL,
    "discountPrice" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "refresh_job_links_refreshJobId_fkey" FOREIGN KEY ("refreshJobId") REFERENCES "refresh_jobs" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "refresh_job_links_productLinkId_fkey" FOREIGN KEY ("productLinkId") REFERENCES "product_links" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "refresh_job_links_groceryItemId_fkey" FOREIGN KEY ("groceryItemId") REFERENCES "grocery_items" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "refresh_job_links_refreshJobId_productLinkId_key" ON "refresh_job_links"("refreshJobId", "productLinkId");
CREATE INDEX "refresh_jobs_status_createdAt_idx" ON "refresh_jobs"("status", "createdAt");
CREATE INDEX "refresh_jobs_shoppingListId_status_idx" ON "refresh_jobs"("shoppingListId", "status");
CREATE INDEX "refresh_jobs_groceryItemId_status_idx" ON "refresh_jobs"("groceryItemId", "status");
CREATE INDEX "refresh_job_links_refreshJobId_status_idx" ON "refresh_job_links"("refreshJobId", "status");
CREATE INDEX "refresh_job_links_groceryItemId_status_idx" ON "refresh_job_links"("groceryItemId", "status");
