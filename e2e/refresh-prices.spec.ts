import { test, expect } from '@playwright/test';
import {
  resetDatabase,
  createShoppingList,
  createGroceryItem,
  addItemToList,
  createProductLink,
  updateShoppingListRefreshStatus,
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

test('refresh prices from list triggers request and completes (mocked)', async ({ page }) => {
  const weekly = await createShoppingList('Weekly');
  const apples = await createGroceryItem('Apples');
  await addItemToList({ shoppingListId: weekly.id, groceryItemId: apples.id, quantity: 1 });
  await createProductLink({
    groceryItemId: apples.id,
    url: 'https://example.com/apples',
    store: 'woolworths',
  });

  await page.route('**/api/refresh-prices', async (route) => {
    await updateShoppingListRefreshStatus(weekly.id, 'refreshing');
    setTimeout(() => {
      void updateShoppingListRefreshStatus(weekly.id, 'idle');
    }, 500);

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, message: 'Price refresh started' }),
    });
  });

  await page.goto(`shopping-lists/${weekly.id}`);
  await page.waitForLoadState('networkidle');
  await page.waitForFunction(() => {
    const h1 = document.querySelector('h1');
    return h1 && h1.innerText.length > 0;
  }, { timeout: 30000 });

  const [request] = await Promise.all([
    page.waitForRequest((req) => req.method() === 'POST' && req.url().includes('/api/refresh-prices')),
    page.locator('header').locator('button:has(svg.lucide-refresh-cw)').click(),
  ]);

  expect(request.postDataJSON()).toMatchObject({ shoppingListId: weekly.id });

  await expect(page.getByText('Prices refreshed successfully').first()).toBeVisible({ timeout: 15000 });
});
