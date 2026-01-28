import { test, expect } from '@playwright/test';
import {
  resetDatabase,
  createShoppingList,
  createGroceryItem,
  addItemToList,
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

test('create shopping list', async ({ page }) => {
  await page.goto('shopping-lists');
  await page.waitForLoadState('networkidle');
  await page.waitForFunction(() => {
    const h1 = document.querySelector('h1');
    return h1 && h1.innerText.length > 0;
  }, { timeout: 30000 });

  await page.locator('header').locator('button:has(svg.lucide-plus)').click();
  await page.getByPlaceholder('Shopping list name').fill('Weekly');

  const [request] = await Promise.all([
    page.waitForRequest((req) => req.method() === 'POST' && req.url().includes('/api/shopping-lists')),
    page.getByRole('button', { name: 'Create' }).click(),
  ]);

  expect(request.postDataJSON()).toMatchObject({ name: 'Weekly' });
  await expect(page.getByRole('heading', { name: 'Weekly' })).toBeVisible();
  await expect(page.getByText('0')).toBeVisible();
});

test('home redirects to last visited list', async ({ page }) => {
  const weekly = await createShoppingList('Weekly');
  const bbq = await createShoppingList('BBQ');

  await page.goto('shopping-lists');
  await page.waitForLoadState('networkidle');
  await page.waitForFunction(() => {
    const h2 = document.querySelector('h2');
    return h2 && h2.innerText.length > 0;
  }, { timeout: 30000 });
  await page.getByRole('link', { name: /BBQ/ }).click();

  await expect(page).toHaveURL(new RegExp(`/shopping-lists/${bbq.id}$`));

  await page.goto('./');
  await expect(page).toHaveURL(new RegExp(`/shopping-lists/${bbq.id}$`));

  await page.goto('shopping-lists');
  await expect(page.getByRole('heading', { name: 'Weekly' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'BBQ' })).toBeVisible();
});

test('rename shopping list', async ({ page }) => {
  const weekly = await createShoppingList('Weekly');

  await page.goto(`shopping-lists/${weekly.id}/edit`);
  await page.waitForLoadState('networkidle');
  await page.waitForFunction(() => {
    const label = document.querySelector('label');
    return label && label.innerText.length > 0;
  }, { timeout: 30000 });
  await page.getByPlaceholder('Shopping list name').fill('Weekly Groceries');

  const [request] = await Promise.all([
    page.waitForRequest((req) => req.method() === 'PATCH' && req.url().includes(`/api/shopping-lists/${weekly.id}`)),
    page.keyboard.press('Tab'),
  ]);

  expect(request.postDataJSON()).toMatchObject({ name: 'Weekly Groceries' });

  await page.goto('shopping-lists');
  await expect(page.getByRole('heading', { name: 'Weekly Groceries' })).toBeVisible();
});

test('delete shopping list shows item count and removes list', async ({ page }) => {
  const weekly = await createShoppingList('Weekly');
  const apples = await createGroceryItem('Apples');
  const bread = await createGroceryItem('Bread');
  const milk = await createGroceryItem('Milk');

  await addItemToList({ shoppingListId: weekly.id, groceryItemId: apples.id, quantity: 1 });
  await addItemToList({ shoppingListId: weekly.id, groceryItemId: bread.id, quantity: 1 });
  await addItemToList({ shoppingListId: weekly.id, groceryItemId: milk.id, quantity: 1 });

  await page.goto(`shopping-lists/${weekly.id}/edit`);
  await page.waitForLoadState('networkidle');
  await page.waitForFunction(() => {
    const input = document.querySelector('input');
    return input && input.value.length > 0;
  }, { timeout: 30000 });

  await page.getByRole('button', { name: 'Delete' }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('It has 3 active items');

  const [request] = await Promise.all([
    page.waitForRequest((req) => req.method() === 'DELETE' && req.url().includes(`/api/shopping-lists/${weekly.id}`)),
    dialog.getByRole('button', { name: 'Delete' }).click(),
  ]);

  expect(request.method()).toBe('DELETE');
  await expect(page).toHaveURL(/\/shopping-lists$/);
  await expect(page.getByRole('heading', { name: 'Weekly' })).toHaveCount(0);
});
