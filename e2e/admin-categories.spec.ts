import { test, expect } from '@playwright/test';
import {
  resetDatabase,
  createCategory,
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

test('admin categories CRUD', async ({ page }) => {
  await createCategory('Fruit', 0);

    await page.goto('admin/categories');
  await page.waitForLoadState('networkidle');
  
  // Wait for React to hydrate and render
  await page.waitForFunction(() => {
    const h1 = document.querySelector('h1');
    return h1 && h1.innerText === 'Edit Categories';
  }, { timeout: 30000 });

  await page.locator('header').locator('button:has(svg.lucide-plus)').click();
  await page.getByPlaceholder('Category name').fill('Dairy');

  const [createRequest] = await Promise.all([
    page.waitForRequest((req) => req.method() === 'POST' && req.url().includes('/api/categories')),
    page.getByRole('button', { name: 'Add' }).click(),
  ]);

  expect(createRequest.postDataJSON()).toMatchObject({ name: 'Dairy' });
  await expect(page.getByText('Dairy')).toBeVisible();

  const dairyRow = page.getByRole('heading', { name: 'Dairy', level: 2 }).locator('..');
  await dairyRow.getByRole('button', { name: 'Rename category' }).click();
  
  // Input appears globally after clicking rename
  const renameInput = page.getByRole('textbox');
  await expect(renameInput).toBeVisible();
  await renameInput.fill('Dairy & Eggs');

  const [renameRequest] = await Promise.all([
    page.waitForRequest((req) => req.method() === 'PATCH' && req.url().includes('/api/categories/')),
    page.keyboard.press('Enter'),
  ]);

  expect(renameRequest.postDataJSON()).toMatchObject({ name: 'Dairy & Eggs' });
  await expect(page.getByText('Dairy & Eggs')).toBeVisible();

  const renamedRow = page.getByRole('heading', { name: 'Dairy & Eggs', level: 2 }).locator('..');

  page.once('dialog', (dialog) => dialog.accept());
  const [deleteRequest] = await Promise.all([
    page.waitForRequest((req) => req.method() === 'DELETE' && req.url().includes('/api/categories/')),
    renamedRow.getByRole('button', { name: 'Delete category' }).click(),
  ]);

  expect(deleteRequest.method()).toBe('DELETE');
  await expect(page.getByText('Dairy & Eggs')).toHaveCount(0);
});
