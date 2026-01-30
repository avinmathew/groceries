-- Add label and perUnit to product links
ALTER TABLE "product_links" ADD COLUMN "label" TEXT;
ALTER TABLE "product_links" ADD COLUMN "perUnit" REAL;
