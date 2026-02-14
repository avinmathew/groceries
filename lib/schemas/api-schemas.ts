import { z } from "zod";

/**
 * Shared Zod schemas for API validation
 */

// Common ID validation
export const idSchema = z.string().min(1, "ID is required");

// Shopping List schemas
export const createShoppingListSchema = z.object({
  name: z.string({ required_error: "Name is required" }).trim().min(1, "Name is required"),
});

export const updateShoppingListSchema = z.object({
  name: z.string().trim().min(1, "Name is required").optional(),
});

// Shopping List Item schemas
export const updateShoppingListItemSchema = z.object({
  name: z.string().trim().optional(),
  quantity: z.number().int().min(1).optional(),
  notes: z.string().trim().nullable().optional(),
  categoryId: z.string().nullable().optional(),
  status: z.enum(['active', 'watchlisted', 'completed']).optional(),
});

export const addItemToShoppingListSchema = z.object({
  name: z.string({ required_error: "Name is required" }).trim().min(1, "Name is required"),
  shoppingListId: z.string({ required_error: "Shopping list ID is required" }).min(1, "Shopping list ID is required"),
  categoryId: z.string().nullable().optional(),
  quantity: z.number().int().min(1).default(1),
});

export const addGroceryToListSchema = z.object({
  groceryItemId: z.string().min(1, "Grocery item ID is required"),
  shoppingListId: z.string().min(1, "Shopping list ID is required"),
  quantity: z.number().int().min(1).default(1),
  notes: z.string().trim().nullable().optional(),
});

// Grocery Item schemas
export const createGroceryItemSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  categoryId: z.string().nullable().optional(),
});

export const updateGroceryItemSchema = z.object({
  name: z.string().trim().min(1, "Name is required").optional(),
  categoryId: z.string().nullable().optional(),
});

// Product Link schemas
export const createProductLinkSchema = z.object({
  url: z.string().url("Invalid URL").trim(),
  store: z.enum(['woolworths', 'coles', 'aldi'], {
    errorMap: () => ({ message: "Store must be woolworths, coles, or aldi" }),
  }),
  groceryItemId: z.string().min(1, "Grocery item ID is required"),
  label: z.string().trim().nullable().optional(),
  perUnit: z.number().positive("Per unit must be positive").nullable().optional(),
});

export const updateProductLinkSchema = z.object({
  url: z.string().url("Invalid URL").trim().optional(),
  label: z.string().trim().nullable().optional(),
  perUnit: z.union([
    z.number().positive("Per unit must be positive"),
    z.string().transform((val) => val === "" ? null : Number(val))
  ]).nullable().optional(),
  regularPrice: z.number().nullable().optional(),
  discountPrice: z.number().nullable().optional(),
  lastRefreshed: z.string().nullable().optional(),
});

// Category schemas
export const createCategorySchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
});

export const updateCategorySchema = z.object({
  name: z.string().trim().min(1, "Name is required").optional(),
  order: z.number().int().min(0).optional(),
});

export const reorderCategoriesSchema = z.object({
  categoryIds: z.array(z.string()).min(1, "Category IDs are required"),
});

/**
 * TypeScript types (inferred from schemas)
 */
export type CreateShoppingList = z.infer<typeof createShoppingListSchema>;
export type UpdateShoppingList = z.infer<typeof updateShoppingListSchema>;
export type UpdateShoppingListItem = z.infer<typeof updateShoppingListItemSchema>;
export type AddItemToShoppingList = z.infer<typeof addItemToShoppingListSchema>;
export type AddGroceryToList = z.infer<typeof addGroceryToListSchema>;
export type CreateGroceryItem = z.infer<typeof createGroceryItemSchema>;
export type UpdateGroceryItem = z.infer<typeof updateGroceryItemSchema>;
export type CreateProductLink = z.infer<typeof createProductLinkSchema>;
export type UpdateProductLink = z.infer<typeof updateProductLinkSchema>;
export type CreateCategory = z.infer<typeof createCategorySchema>;
export type UpdateCategory = z.infer<typeof updateCategorySchema>;
export type ReorderCategories = z.infer<typeof reorderCategoriesSchema>;
