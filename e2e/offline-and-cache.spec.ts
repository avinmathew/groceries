import { test, expect } from '@playwright/test';
import {
  resetDatabase,
  createShoppingList,
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

test('offline queue shows pending and syncs when back online', async ({ page, context }) => {
  const weekly = await createShoppingList('Weekly');

  await page.goto(`shopping-lists/${weekly.id}`);
  await page.waitForLoadState('networkidle');
  await page.waitForFunction(() => {
    const h1 = document.querySelector('h1');
    return h1 && h1.innerText.length > 0;
  }, { timeout: 30000 });

  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await page.waitForTimeout(500);
  await expect(page.getByText('Offline')).toBeVisible();

  await page.getByRole('button', { name: 'Add an item...' }).click();
  await page.getByPlaceholder('Type to search...').fill('Bananas');
  await page.getByRole('button', { name: /Create "Bananas"/ }).click();
  await page.waitForTimeout(500);

  await expect(page.getByText('Item queued (offline)').first()).toBeVisible();
  await expect(page.getByRole('button', { name: /pending/ })).toBeVisible();

  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));

  await expect(page.getByRole('button', { name: /pending/ })).toBeHidden({ timeout: 15000 });

  await page.reload();
  await expect(page.getByText('Bananas')).toBeVisible();
});

test('cache does not revert changes after navigating away and back', async ({ page }) => {
  const weekly = await createShoppingList('Weekly');

  await page.goto(`shopping-lists/${weekly.id}`);
  await page.waitForLoadState('networkidle');
  await page.waitForFunction(() => {
    const h1 = document.querySelector('h1');
    return h1 && h1.innerText.length > 0;
  }, { timeout: 30000 });
  await page.getByRole('button', { name: 'Add an item...' }).click();
  await page.getByPlaceholder('Type to search...').fill('Apples');
  await page.getByRole('button', { name: /Create "Apples"/ }).click();

  await expect(page.getByText('Apples')).toBeVisible();

  await page.locator('header').locator('button:has(svg.lucide-arrow-left)').click();
  await expect(page).toHaveURL(/\/shopping-lists$/);
  await page.getByRole('link', { name: /Weekly/ }).click();

  await expect(page.getByText('Apples')).toBeVisible();
});
