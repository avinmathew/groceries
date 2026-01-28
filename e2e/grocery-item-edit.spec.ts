import { test, expect } from '@playwright/test';
import {
  resetDatabase,
  createShoppingList,
  createCategory,
  createGroceryItem,
  addItemToList,
  createProductLink,
  createPriceHistory,
} from './seed';
import { clearClientState, setupDebugging } from './test-utils';

let debug: ReturnType<typeof setupDebugging> | null = null;

test.beforeEach(async ({ page }) => {
  await resetDatabase();
  await clearClientState(page);
  debug = setupDebugging(page);
});

test.afterEach(async ({ page }, testInfo) => {
  if (debug) {
    await debug.attach(testInfo, page);
    debug = null;
  }
});

test('edit notes and category persists to list view', async ({ page }) => {
  const weekly = await createShoppingList('Weekly');
  const fruit = await createCategory('Fruit', 0);
  const apples = await createGroceryItem('Apples');
  const listItem = await addItemToList({ shoppingListId: weekly.id, groceryItemId: apples.id, quantity: 1 });

  await page.goto(`shopping-lists/${weekly.id}`);
  await page.waitForLoadState('networkidle');
  await page.waitForFunction(() => {
    const h1 = document.querySelector('h1');
    return h1 && h1.innerText.length > 0;
  }, { timeout: 30000 });
  await page.locator(`a:has(svg.lucide-info)`).first().click();
  await expect(page.getByRole('heading', { name: 'Edit Item' })).toBeVisible();

  await page.getByPlaceholder('Add notes').fill('Granny Smith');

  const [request] = await Promise.all([
    page.waitForRequest((req) => req.method() === 'PATCH' && req.url().includes(`/api/grocery-items/${listItem.id}`)),
    page.keyboard.press('Tab'),
  ]);

  expect(request.postDataJSON()).toMatchObject({ notes: 'Granny Smith' });

  const categorySelect = page.getByText('Category').locator('..').getByRole('combobox');
  await categorySelect.click();
  await page.getByRole('option', { name: 'Fruit' }).click();

  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page).toHaveURL(new RegExp(`/shopping-lists/${weekly.id}$`));
  await page.waitForLoadState('networkidle');
  await expect(page.getByText('Granny Smith')).toBeVisible();
  await expect(page.getByText('Fruit')).toBeVisible();
});

test('add product link appears in list', async ({ page }) => {
  const weekly = await createShoppingList('Weekly');
  const apples = await createGroceryItem('Apples');
  await addItemToList({ shoppingListId: weekly.id, groceryItemId: apples.id, quantity: 1 });

  await page.goto(`shopping-lists/${weekly.id}`);
  await page.waitForLoadState('networkidle');
  await page.waitForFunction(() => {
    const h1 = document.querySelector('h1');
    return h1 && h1.innerText.length > 0;
  }, { timeout: 30000 });
  await page.locator('a:has(svg.lucide-info)').first().click();

  await page.getByPlaceholder('Product URL').fill('https://example.com/apples');

  const [request] = await Promise.all([
    page.waitForRequest((req) => req.method() === 'POST' && req.url().includes('/api/product-links')),
    page.locator('button:has(svg.lucide-plus)').last().click(),
  ]);

  expect(request.postDataJSON()).toMatchObject({
    url: 'https://example.com/apples',
    store: 'woolworths',
  });

  await expect(page.getByText('https://example.com/apples')).toBeVisible();
});

test('price history loads without error', async ({ page }) => {
  const weekly = await createShoppingList('Weekly');
  const apples = await createGroceryItem('Apples');
  await addItemToList({ shoppingListId: weekly.id, groceryItemId: apples.id, quantity: 1 });
  const link = await createProductLink({
    groceryItemId: apples.id,
    url: 'https://example.com/apples',
    store: 'woolworths',
    regularPrice: 4.5,
  });
  await createPriceHistory({
    productLinkId: link.id,
    regularPrice: 4.5,
  });

  await page.goto(`shopping-lists/${weekly.id}`);
  await page.waitForLoadState('networkidle');
  await page.waitForFunction(() => {
    const h1 = document.querySelector('h1');
    return h1 && h1.innerText.length > 0;
  }, { timeout: 30000 });
  await page.locator('a:has(svg.lucide-info)').first().click();

  await expect(page.getByRole('heading', { name: 'Price History' })).toBeVisible();
  await expect(page.getByRole('cell', { name: '$4.50' })).toBeVisible();
});
