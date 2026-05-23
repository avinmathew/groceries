import { test, expect } from '@playwright/test';
import {
  resetDatabase,
  createShoppingList,
  createGroceryItem,
  addItemToList,
  createProductLink,
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

test('add a brand-new grocery item from dialog', async ({ page }) => {
  const weekly = await createShoppingList('Weekly');

  await page.goto(`shopping-lists/${weekly.id}`);
  await page.waitForLoadState('networkidle');
  await page.waitForFunction(() => {
    const h1 = document.querySelector('h1');
    return h1 && h1.innerText.length > 0;
  }, { timeout: 30000 });
  await page.getByRole('button', { name: 'Add an item...' }).click();
  await page.getByPlaceholder('Type to search...').fill('Apples');

  const [request] = await Promise.all([
    page.waitForRequest((req) => req.method() === 'POST' && req.url().includes('/api/grocery-items')),
    page.getByRole('button', { name: /Create "Apples"/ }).click(),
  ]);

  expect(request.postDataJSON()).toMatchObject({ name: 'Apples', shoppingListId: weekly.id });

  await expect(page.getByText('Apples')).toBeVisible();
  await expect(page.getByText('Uncategorised')).toBeVisible();
});

test('adding existing active item increments quantity', async ({ page }) => {
  const weekly = await createShoppingList('Weekly');
  const apples = await createGroceryItem('Apples');
  await addItemToList({ shoppingListId: weekly.id, groceryItemId: apples.id, quantity: 1 });

  await page.goto(`shopping-lists/${weekly.id}`);
  await page.waitForLoadState('networkidle');
  await page.waitForFunction(() => {
    const h1 = document.querySelector('h1');
    return h1 && h1.innerText.length > 0;
  }, { timeout: 30000 });
  await page.getByRole('button', { name: 'Add an item...' }).click();
  await page.getByPlaceholder('Type to search...').fill('Apples');

  const [request] = await Promise.all([
    page.waitForRequest((req) => req.method() === 'POST' && req.url().includes('/api/grocery-items')),
    page.getByRole('button', { name: 'Apples' }).click(),
  ]);

  expect(request.postDataJSON()).toMatchObject({ name: 'Apples', shoppingListId: weekly.id });
  await expect(page.getByText('Apples (2)')).toBeVisible();
});

test('cross off and restore item', async ({ page }) => {
  const weekly = await createShoppingList('Weekly');
  const apples = await createGroceryItem('Apples');
  const listItem = await addItemToList({ shoppingListId: weekly.id, groceryItemId: apples.id, quantity: 1 });

  await page.goto(`shopping-lists/${weekly.id}`);
  await page.waitForLoadState('networkidle');
  await page.waitForFunction(() => {
    const h1 = document.querySelector('h1');
    return h1 && h1.innerText.length > 0;
  }, { timeout: 30000 });

  const [completeRequest] = await Promise.all([
    page.waitForRequest((req) => req.method() === 'PATCH' && req.url().includes(`/api/grocery-items/${listItem.id}`)),
    page.getByText('Apples').click(),
  ]);

  expect(completeRequest.postDataJSON()).toMatchObject({ status: 'completed' });
  await expect(page.getByText('Crossed off')).toBeVisible();

  const [restoreRequest] = await Promise.all([
    page.waitForRequest((req) => req.method() === 'PATCH' && req.url().includes(`/api/grocery-items/${listItem.id}`)),
    page.getByText('Apples').click(),
  ]);

  expect(restoreRequest.postDataJSON()).toMatchObject({ status: 'active' });
  await expect(page.getByText('Crossed off')).toBeHidden();
});

test('mark active item for later and exclude it from the total', async ({ page }) => {
  const weekly = await createShoppingList('Weekly');
  const apples = await createGroceryItem('Apples');
  const listItem = await addItemToList({ shoppingListId: weekly.id, groceryItemId: apples.id, quantity: 1 });
  await createProductLink({
    groceryItemId: apples.id,
    url: 'https://example.com/apples',
    store: 'woolworths',
    regularPrice: 4.5,
  });

  await page.goto(`shopping-lists/${weekly.id}`);
  await page.waitForLoadState('networkidle');
  await page.waitForFunction(() => {
    const h1 = document.querySelector('h1');
    return h1 && h1.innerText.length > 0;
  }, { timeout: 30000 });

  const totalSection = page.getByText('Total:').locator('..');
  await expect(totalSection).toContainText('$4.50');

  const [laterRequest] = await Promise.all([
    page.waitForRequest((req) => req.method() === 'PATCH' && req.url().includes(`/api/grocery-items/${listItem.id}`)),
    page.getByRole('button', { name: 'Mark Apples for later' }).click(),
  ]);

  expect(laterRequest.postDataJSON()).toMatchObject({ status: 'later' });
  await expect(page.getByRole('button', { name: 'Mark Apples for now' })).toBeVisible();
  await expect(page.getByText('Apples')).toBeVisible();
  await expect(totalSection).toBeHidden();
});

test('delete grocery item from all lists', async ({ page }) => {
  const weekly = await createShoppingList('Weekly');
  const bbq = await createShoppingList('BBQ');
  const apples = await createGroceryItem('Apples');

  await addItemToList({ shoppingListId: weekly.id, groceryItemId: apples.id, quantity: 1 });
  await addItemToList({ shoppingListId: bbq.id, groceryItemId: apples.id, quantity: 1 });

  await page.goto(`shopping-lists/${weekly.id}`);
  await page.waitForLoadState('networkidle');
  await page.waitForFunction(() => {
    const h1 = document.querySelector('h1');
    return h1 && h1.innerText.length > 0;
  }, { timeout: 30000 });
  
  // Click edit button in header (3rd button: back, refresh, add, edit)
  await page.locator('header').getByRole('button').nth(3).click();

  // Find the Apples row and click its delete button (last button in the row)
  const applesRow = page.getByRole('button', { name: 'Apples' }).locator('..');
  await applesRow.locator('button').last().click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('This item is on 2 shopping lists.');

  const [deleteRequest] = await Promise.all([
    page.waitForRequest((req) => req.method() === 'DELETE' && req.url().includes(`/api/grocery-items/${apples.id}?scope=all`)),
    dialog.getByRole('button', { name: 'Delete' }).click(),
  ]);

  expect(deleteRequest.method()).toBe('DELETE');
  await expect(page.getByText('Apples')).toHaveCount(0);

  await page.goto(`shopping-lists/${bbq.id}`);
  await expect(page.getByText('Apples')).toHaveCount(0);
});
